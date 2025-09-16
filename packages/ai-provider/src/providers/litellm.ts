import { Transform, pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { Pool } from 'undici'
import type { AiProvider, AiResponseResult } from '../lib/ai.ts'
import { DEFAULT_UNDICI_POOL_OPTIONS, LITELLM_DEFAULT_API_PATH, LITELLM_DEFAULT_BASE_URL, LITELLM_PROVIDER_NAME, UNDICI_USER_AGENT } from '../lib/config.ts'
import { ProviderResponseNoContentError } from '../lib/errors.ts'
import { createEventId, encodeEvent, parseEventStream, type AiStreamEvent } from '../lib/event.ts'
import { type AiChatHistory, type AiResponseFormat, type AiTool, type ProviderClient, type ProviderClientContext, type ProviderClientOptions, type ProviderOptions, type ProviderRequestOptions, type ProviderResponse, type StreamChunkCallback } from '../lib/provider.ts'
import { BaseProvider } from './lib/base.ts'
import { createLiteLLMClient } from './lib/litellm-undici-client.ts'

export type LiteLLMOptions = ProviderOptions
export type LiteLLMResponse = {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message?: {
      role: string
      content: string
    }
    delta?: {
      content?: string
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export type LiteLLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type LiteLLMRequest = {
  model: string
  messages: LiteLLMMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  response_format?: AiResponseFormat
  tool_choice?: string
  tools?: Array<AiTool>
  allowed_tools?: Array<String>
}

export type LiteLLMClientOptions = ProviderClientOptions & {
  baseUrl: string
  apiPath: string
  apiKey: string
  userAgent: string
  providerName: string
  undiciOptions?: Pool.Options
  extraHeaders?: Map<String,String>
  checkResponseFn?: (response: any, context: ProviderClientContext, providerName: string) => Promise<void>
}

export class LiteLLMProvider extends BaseProvider {
  name: AiProvider = 'litellm'
  providerName: string = LITELLM_PROVIDER_NAME

  constructor (options: LiteLLMOptions, client?: ProviderClient) {
    super(options, client ?? createLiteLLMClient({
      providerName: LITELLM_PROVIDER_NAME,
      baseUrl: options.clientOptions?.baseUrl ?? LITELLM_DEFAULT_BASE_URL,
      apiPath: options.clientOptions?.apiPath ?? LITELLM_DEFAULT_API_PATH,
      apiKey: options.clientOptions?.apiKey ?? '',
      userAgent: options.clientOptions?.userAgent ?? UNDICI_USER_AGENT,
      undiciOptions: options.clientOptions?.undiciOptions ?? DEFAULT_UNDICI_POOL_OPTIONS,
      extraHeaders: options.clientOptions?.extraHeaders
    }))
  }

  async request (model: string, prompt: string, options: ProviderRequestOptions): Promise<ProviderResponse> {
    const messages: LiteLLMMessage[] = options.context ? [{ role: 'system', content: options.context }] : []
    messages.push(...this.chatHistoryToMessages(options.history))
    messages.push({ role: 'user', content: prompt })

    const request: LiteLLMRequest = {
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: options.stream,
      response_format: options.responseFormat,
      tools: options.tools,
      tool_choice: options.toolChoice,
      allowed_tools: options.allowedTools,
    }

    if (options.stream) {
      const response = await this.client.stream(this.api, request, this.context)
      const transformer = new LiteLLMStreamTransformer(this.providerName, options.onStreamChunk)

      // Use pipeline to connect the response stream to the transformer
      const pipelineAsync = promisify(pipeline)

      // Create the pipeline but don't await it - return the transformer stream
      pipelineAsync(response, transformer).catch((err) => {
        // Handle pipeline errors by destroying the transformer
        transformer.destroy(err)
      })

      return transformer
    }

    this.logger.debug({ request }, `${this.providerName} request`)
    const response = await this.client.request(this.api, request, this.context)

    this.logger.debug({ response }, `${this.providerName} full response (no stream)`)

    const text = response.choices?.[0]?.message?.content
    if (!text) {
      throw new ProviderResponseNoContentError(this.providerName)
    }

    return {
      text,
      result: mapResponseResult(response.choices?.[0]?.finish_reason)
    }
  }

  private chatHistoryToMessages (chatHistory?: AiChatHistory): LiteLLMMessage[] {
    if (chatHistory === undefined) {
      return []
    }

    const messages: LiteLLMMessage[] = []
    for (const previousInteraction of chatHistory) {
      messages.push({ role: 'user', content: previousInteraction.prompt })
      messages.push({ role: 'assistant', content: previousInteraction.response })
    }

    return messages
  }
}

class LiteLLMStreamTransformer extends Transform {
  providerName: string
  chunkCallback?: StreamChunkCallback

  constructor (providerName: string, chunkCallback?: StreamChunkCallback) {
    super()
    this.providerName = providerName
    this.chunkCallback = chunkCallback
  }

  async _transform (chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
    try {
      const events = parseEventStream(chunk.toString('utf8'))
      for (const event of events) {
        if (event.event === 'error') {
          const error = new ProviderResponseNoContentError(`${this.providerName} stream`)

          const eventData: AiStreamEvent = {
            id: event.id ?? createEventId(),
            event: 'error',
            data: error
          }
          this.push(encodeEvent(eventData))
          return callback()
        }

        // data only events
        if (!event.event && event.data) {
          if (event.data === '[DONE]') {
            return callback()
          }

          const data = JSON.parse(event.data)
          const { content } = data.choices[0].delta
          let response = content ?? ''
          if (this.chunkCallback) {
            response = await this.chunkCallback(response)
          }

          const eventData: AiStreamEvent = {
            id: event.id ?? createEventId(),
            event: 'content',
            data: { response }
          }
          this.push(encodeEvent(eventData))

          const finish = data.choices[0].finish_reason
          if (finish) {
            const eventData: AiStreamEvent = {
              id: event.id ?? createEventId(),
              event: 'end',
              data: { response: mapResponseResult(finish) }
            }
            this.push(encodeEvent(eventData))
            return callback()
          }
        }
      }
      callback()
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

function mapResponseResult (result: string | undefined): AiResponseResult {
  // response is complete
  if (result === 'stop') {
    return 'COMPLETE'
  }
  // when the response is truncated because of maxTokens
  if (result === 'length') {
    return 'INCOMPLETE_MAX_TOKENS'
  }
  return 'INCOMPLETE_UNKNOWN'
}
