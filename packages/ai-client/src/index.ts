import { Client } from './client.ts'
import type { ClientOptions } from './types.ts'

export function buildClient (options: ClientOptions): Client {
  return new Client(options)
}

export { convertEventToMessage, createAsyncIterableStream, createStreamFromResponse, parseEvent, Client, type ParsedEvent, type SSEContentData, type SSEData, type SSEEndData, type SSEErrorData, type SSEResponseData } from './client.ts'

export { consoleLogger, nullLogger } from './console-logger.ts'

export type {
  ClientOptions,
  AskOptions,
  AskResponse,
  StreamMessage,
  AskResponseStream,
  AskResponseContent,
  Logger,
  QueryModel
} from './types.ts'
