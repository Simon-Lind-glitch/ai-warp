import type { Readable } from 'node:stream'
import type { Logger } from 'pino'
import type { Pool } from 'undici'
import { DeepSeekProvider } from '../providers/deepseek.ts'
import { GeminiProvider } from '../providers/gemini.ts'
import { LiteLLMProvider } from '../providers/litellm.ts'
import { OpenAIProvider } from '../providers/openai.ts'
import type { AiProvider, AiResponseResult } from './ai.ts'
import { OptionError } from './errors.ts'

export type AiChatHistory = {
  prompt: string
  response: string
}[]

export type AiSessionId = string

export type AiResponseFormat = {
  type: string
  strict: boolean
  json_schema: string
}

export type AiToolFunctionDefinition = {
  name: string
  description: string
  parameters?: Object
}

export type AiToolMCP = AiToolRequiresApproval & {
  type: 'mcp'
  server_label: string
  server_url: string
}

export type AiToolFunction = AiToolRequiresApproval & {
  type: 'function'
  function: AiToolFunctionDefinition
}

export type AiToolRequiresApproval = {
  require_approval?: 'always' | 'never'
}

export type AiTool = AiToolMCP | AiToolFunction

export type ProviderRequestOptions = {
  context?: string
  history?: AiChatHistory
  sessionId?: AiSessionId
  temperature?: number
  stream?: boolean
  onStreamChunk?: (response: string) => Promise<string>
  maxTokens?: number
  extraHeaders?: Record<string, string>
  responseFormat?: AiResponseFormat
  tools?: Array<AiTool>
  allowedTools?: Array<string>
  toolChoice?: string
  apiKey?: string
}

export interface Provider {
  name: AiProvider
  request: (model: string, prompt: string, options: ProviderRequestOptions) => Promise<ProviderResponse>
  close: () => Promise<void>
}

export interface ProviderOptions {
  logger: Logger
  client?: ProviderClient
  clientOptions?: ProviderClientOptions
}

export interface ProviderClientOptions {
  apiKey: string
  baseUrl?: string
  apiPath?: string
  userAgent?: string
  undiciOptions?: Pool.Options
}

export type ProviderClientContext = {
  logger: Logger
}

export type ProviderClientRequest = {
  model: string
  prompt: string
  options: ProviderRequestOptions
}

export type ProviderContentResponse = {
  text: string
  result: AiResponseResult
}

export interface ProviderClient {
  init: (options: ProviderClientOptions | undefined, context: ProviderClientContext) => Promise<any>
  close: (api: any, context: ProviderClientContext) => Promise<void>
  request: (api: any, request: any, context: ProviderClientContext) => Promise<any>
  stream: (api: any, request: any, context: ProviderClientContext) => Promise<any>
}

export type ProviderResponse = ProviderContentResponse | Readable

export type StreamChunkCallback = (response: string) => Promise<string>

export function createAiProvider (provider: AiProvider, options: ProviderOptions, client?: ProviderClient) {
  if (provider === 'openai') {
    return new OpenAIProvider(options, client)
  }

  if (provider === 'deepseek') {
    return new DeepSeekProvider(options, client)
  }

  if (provider === 'gemini') {
    return new GeminiProvider(options, client)
  }

  if (provider === 'litellm') {
    return new LiteLLMProvider(options, client)
  }

  throw new OptionError(`Provider "${provider}" not supported`)
}
