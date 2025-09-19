import assert from 'node:assert'
import { test } from 'node:test'
import pino from 'pino'
import { Ai, type AiContentResponse } from '../src/lib/ai.ts'
import { createDummyClient } from './helper/helper.ts'

const apiKey = 'test'
const logger = pino({ level: 'silent' })

test('should select the model from the list of models', async () => {
  const openaiClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'All good from openai' } }] }
    }
  }

  const deepseekClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'All good from deepseek' } }] }
    }
  }

  const ai = new Ai({
    logger,
    providers: {
      openai: { apiKey, client: openaiClient },
      deepseek: { apiKey, client: deepseekClient },
    },
    models: [
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'openai', model: 'gpt-4o-mini' },
    ],
  })
  await ai.init()

  const response = await ai.request({
    prompt: 'Hello, how are you?'
  }) as AiContentResponse

  assert.equal((response).text, 'All good from deepseek')
})

test('should select the model in the request from the list of models', async () => {
  const openaiClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'All good from openai' } }] }
    }
  }

  const deepseekClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'All good from deepseek' } }] }
    }
  }

  const ai = new Ai({
    logger,
    providers: {
      openai: { apiKey, client: openaiClient },
      deepseek: { apiKey, client: deepseekClient },
    },
    models: [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'deepseek', model: 'deepseek-chat' }
    ],
  })
  await ai.init()

  const response = await ai.request({
    models: ['deepseek:deepseek-chat'],
    prompt: 'Hello, how are you?'
  }) as AiContentResponse

  assert.equal((response).text, 'All good from deepseek')
})

test('should handle all the providers', async () => {
  const openaiClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'Response from OpenAI' } }] }
    }
  }

  const deepseekClient = {
    ...createDummyClient(),
    request: async () => {
      return { choices: [{ message: { content: 'Response from DeepSeek' } }] }
    }
  }

  const geminiClient = {
    ...createDummyClient(),
    request: async () => {
      return { candidates: [{ content: { parts: [{ text: 'Response from Gemini' }] } }] }
    }
  }

  const liteLLMClient = {
    ...createDummyClient(),
    request: async () => {
      return { candidates: [{ content: { parts: [{ text: 'Response from LiteLLM' }] } }] }
    }
  }

  const ai = new Ai({
    logger,
    providers: {
      openai: { apiKey, client: openaiClient },
      deepseek: { apiKey, client: deepseekClient },
      gemini: { apiKey, client: geminiClient },
      litellm: { apiKey, client: liteLLMClient }

    },
    models: [
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'deepseek', model: 'deepseek-chat' },
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'litellm', model: 'someModelAliasRegisterdInLiteLLM' }
    ],
  })
  await ai.init()

  // Test OpenAI provider
  const openaiResponse = await ai.request({
    models: ['openai:gpt-4o-mini'],
    prompt: 'Hello OpenAI'
  }) as AiContentResponse
  assert.equal(openaiResponse.text, 'Response from OpenAI')

  // Test DeepSeek provider
  const deepseekResponse = await ai.request({
    models: ['deepseek:deepseek-chat'],
    prompt: 'Hello DeepSeek'
  }) as AiContentResponse
  assert.equal(deepseekResponse.text, 'Response from DeepSeek')

  // Test Gemini provider
  const geminiResponse = await ai.request({
    models: ['gemini:gemini-1.5-flash'],
    prompt: 'Hello Gemini'
  }) as AiContentResponse
  assert.equal(geminiResponse.text, 'Response from Gemini')

  // Test LiteLLM provider
  const liteLLMResponse = await ai.request({
    models: ['litellm:someModelAliasRegisterdInLiteLLM'],
    prompt: 'Hello SomeModel'
  }) as AiContentResponse
  assert.equal(liteLLMResponse.text, 'Response from LiteLLM')
})
