import { Readable } from 'node:stream'
import undici from 'undici'
import { ProviderExceededQuotaError, ProviderResponseError } from '../../lib/errors.ts'
import type { ProviderClient, ProviderClientContext, ProviderClientOptions } from '../../lib/provider.ts'
import type { LiteLLMClientOptions, LiteLLMRequest } from '../litellm.ts'

async function checkResponse (response: any, context: ProviderClientContext, providerName: string) {
  if (response.statusCode !== 200) {
    const errorText = await response.body.text()
    context.logger.error({ statusCode: response.statusCode, error: errorText }, `${providerName} API response error`)
    if (response.statusCode === 429) {
      throw new ProviderExceededQuotaError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
    }
    throw new ProviderResponseError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
  }
}

export function createLiteLLMClient (options: LiteLLMClientOptions) {
  const { providerName, baseUrl, apiKey, userAgent, apiPath, undiciOptions } = options

  const checkResponseFn = options.checkResponseFn ?? checkResponse

  const litellmUndiciClient: ProviderClient = {
    init: async (_options: ProviderClientOptions | undefined, _context: ProviderClientContext): Promise<any> => {
      return {
        pool: new undici.Pool(baseUrl, undiciOptions),
        headers: {
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
          'Content-Type': 'application/json',
          'User-Agent': userAgent
        }
      }
    },
    close: async (client, _context: ProviderClientContext): Promise<void> => {
      client.pool.close()
    },
    request: async (client, request: LiteLLMRequest, context: ProviderClientContext): Promise<any> => {
      context.logger.debug({ path: apiPath, request }, `${providerName} undici request`)

      const response = await client.pool.request({
        path: apiPath,
        method: 'POST',
        // Or maybe the headers should be from the request?
        headers: { ...client.headers, ...request.extraHeaders, ...(request.virtualKey && { Authorization: `Bearer ${request.virtualKey}` }) },
        blocking: false,
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          tools: request.tools,
          tool_choice: request.tool_choice,
          response_format: request.response_format,
          litellm_session_id: request.session_id,
          user: request.user,
          stream: false,
          n: 1,
        })
      })

      await checkResponseFn(response, context, providerName)

      const responseData = await response.body.json()
      context.logger.debug({ responseData }, `${providerName} response received`)

      return responseData
    },
    stream: async (client, request: LiteLLMRequest, context: ProviderClientContext): Promise<Readable> => {
      context.logger.debug({ path: apiPath, request }, 'LiteLLM undici stream request')

      const response = await client.pool.request({
        path: apiPath,
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
          tools: request.tools,
          tool_choice: request.tool_choice,
          response_format: request.response_format,
          litellm_session_id: request.session_id,
          user: request.user,
          stream: true,
          n: 1,
        })
      })

      await checkResponseFn(response, context, providerName)

      return response.body as Readable
    }
  }

  return litellmUndiciClient
}
