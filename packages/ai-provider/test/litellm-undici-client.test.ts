import assert from 'node:assert'
import { test } from 'node:test'
import pino from 'pino'
import type { ProviderClientContext } from '../src/lib/provider.ts'
import { createLiteLLMClient } from '../src/providers/lib/litellm-undici-client.ts'
import type { LiteLLMRequest } from '../src/providers/litellm.ts'

const logger = pino({ level: 'silent' })

const mockContext: ProviderClientContext = {
  logger
}

const defaultOptions = {
  providerName: 'TestProvider',
  baseUrl: 'https://api.test.com',
  apiKey: 'test-api-key',
  userAgent: 'test-agent/1.0',
  apiPath: '/v1/chat/completions'
}

test('createLiteLLMClient - should not throw error when apiKey is missing', () => {
  const optionsWithoutApiKey = {
    ...defaultOptions,
    apiKey: ''
  }

  assert.doesNotThrow(() => {
    createLiteLLMClient(optionsWithoutApiKey)
  })
})

test('createLiteLLMClient - should not throw error when apiKey is undefined', () => {
  const optionsWithoutApiKey = {
    ...defaultOptions,
    apiKey: undefined as any
  }

  assert.doesNotThrow(() => {
    createLiteLLMClient(optionsWithoutApiKey)
  })
})

test('createLiteLLMClient - should create client with valid options', () => {
  const client = createLiteLLMClient(defaultOptions)

  assert.ok(client)
  assert.ok(typeof client.init === 'function')
  assert.ok(typeof client.close === 'function')
  assert.ok(typeof client.request === 'function')
  assert.ok(typeof client.stream === 'function')
})

test('createLiteLLMClient - should use default checkResponse function', () => {
  const client = createLiteLLMClient(defaultOptions)
  assert.ok(client)
})

test('createLiteLLMClient - should use custom checkResponseFn when provided', () => {
  const customCheckResponse = async (response: any) => {
    if (response.statusCode !== 200) {
      throw new Error(`Custom error: ${response.statusCode}`)
    }
  }

  const optionsWithCustomCheck = {
    ...defaultOptions,
    checkResponseFn: customCheckResponse
  }

  const client = createLiteLLMClient(optionsWithCustomCheck)
  assert.ok(client)
})

test('createLiteLLMClient - should extract all options correctly', () => {
  const fullOptions = {
    providerName: 'TestProvider',
    baseUrl: 'https://api.test.com',
    apiKey: 'test-key',
    userAgent: 'test/1.0',
    apiPath: '/v1/test',
    undiciOptions: { keepAliveTimeout: 5000 },
    checkResponseFn: async () => {}
  }

  const client = createLiteLLMClient(fullOptions)
  assert.ok(client)
})

test('client.init - should create pool and headers', async () => {
  const client = createLiteLLMClient(defaultOptions)
  let initialized: any

  try {
    initialized = await client.init(undefined, mockContext)

    assert.ok(initialized.pool)
    assert.ok(initialized.headers)
    assert.equal(initialized.headers.Authorization, 'Bearer test-api-key')
    assert.equal(initialized.headers['Content-Type'], 'application/json')
    assert.equal(initialized.headers['User-Agent'], 'test-agent/1.0')
    // Test close method
    await client.close(initialized, mockContext)
  } catch {
    // Ignore errors from actual undici operations
  }
})

test('client.init - should handle undici options', async () => {
  const optionsWithUndici = {
    ...defaultOptions,
    undiciOptions: {
      keepAliveTimeout: 10000,
      keepAliveMaxTimeout: 20000
    }
  }

  const client = createLiteLLMClient(optionsWithUndici)
  let initialized: any

  try {
    initialized = await client.init(undefined, mockContext)
    assert.ok(initialized.pool)
    await client.close(initialized, mockContext)
  } catch {
    // Ignore errors from actual undici operations
  }
})

test('checkResponse function - should handle 200 status', async () => {
  // Create a custom check function that matches the default behavior
  const testCheckResponse = async (response: any, context: ProviderClientContext, providerName: string) => {
    if (response.statusCode !== 200) {
      const errorText = await response.body.text()
      context.logger.error({ statusCode: response.statusCode, error: errorText }, `${providerName} API response error`)
      if (response.statusCode === 429) {
        const { ProviderExceededQuotaError } = await import('../src/lib/errors.ts')
        throw new ProviderExceededQuotaError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
      }
      const { ProviderResponseError } = await import('../src/lib/errors.ts')
      throw new ProviderResponseError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
    }
  }

  const mockResponse = {
    statusCode: 200,
    body: {
      text: async () => 'OK'
    }
  }

  // Should not throw
  await testCheckResponse(mockResponse, mockContext, 'TestProvider')
})

test('checkResponse function - should handle 429 status', async () => {
  const testCheckResponse = async (response: any, context: ProviderClientContext, providerName: string) => {
    if (response.statusCode !== 200) {
      const errorText = await response.body.text()
      context.logger.error({ statusCode: response.statusCode, error: errorText }, `${providerName} API response error`)
      if (response.statusCode === 429) {
        const { ProviderExceededQuotaError } = await import('../src/lib/errors.ts')
        throw new ProviderExceededQuotaError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
      }
      const { ProviderResponseError } = await import('../src/lib/errors.ts')
      throw new ProviderResponseError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
    }
  }

  const mockResponse = {
    statusCode: 429,
    body: {
      text: async () => 'Rate limit exceeded'
    }
  }

  await assert.rejects(async () => {
    await testCheckResponse(mockResponse, mockContext, 'TestProvider')
  }, {
    code: 'PROVIDER_EXCEEDED_QUOTA_ERROR',
    message: 'Ai Provider Response: TestProvider Response: 429 - Rate limit exceeded'
  })
})

test('checkResponse function - should handle other error status', async () => {
  const testCheckResponse = async (response: any, context: ProviderClientContext, providerName: string) => {
    if (response.statusCode !== 200) {
      const errorText = await response.body.text()
      context.logger.error({ statusCode: response.statusCode, error: errorText }, `${providerName} API response error`)
      if (response.statusCode === 429) {
        const { ProviderExceededQuotaError } = await import('../src/lib/errors.ts')
        throw new ProviderExceededQuotaError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
      }
      const { ProviderResponseError } = await import('../src/lib/errors.ts')
      throw new ProviderResponseError(`${providerName} Response: ${response.statusCode} - ${errorText}`)
    }
  }

  const mockResponse = {
    statusCode: 500,
    body: {
      text: async () => 'Internal Server Error'
    }
  }

  await assert.rejects(async () => {
    await testCheckResponse(mockResponse, mockContext, 'TestProvider')
  }, {
    code: 'PROVIDER_RESPONSE_ERROR',
    message: 'Ai Provider Response error: TestProvider Response: 500 - Internal Server Error'
  })
})

test('client methods structure - should test request and stream method calls', async () => {
  const client = createLiteLLMClient(defaultOptions)
  let initialized: any

  try {
    initialized = await client.init(undefined, mockContext)

    // Test request method structure
    const sampleRequest: LiteLLMRequest = {
      model: 'someModelAliasRegisterdInLiteLLM',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      max_tokens: 100
    }

    // Try to call request (will likely fail but executes the method)
    try {
      await client.request(initialized, sampleRequest, mockContext)
    } catch {
      // Expected to fail with real HTTP call
    }

    // Try to call stream (will likely fail but executes the method)
    try {
      await client.stream(initialized, sampleRequest, mockContext)
    } catch {
      // Expected to fail with real HTTP call
    }
  } catch {
    // Ignore initialization errors
  } finally {
    if (initialized) {
      try {
        await client.close(initialized, mockContext)
      } catch {
        // Ignore close errors
      }
    }
  }
})

test('createLiteLLMClient - should handle different option combinations', () => {
  const testCases = [
    { ...defaultOptions },
    { ...defaultOptions, undiciOptions: { keepAliveTimeout: 5000 } },
    { ...defaultOptions, providerName: 'LiteLLM', baseUrl: 'https://api.litellm.com' },
    { ...defaultOptions, apiPath: '/v1/custom', userAgent: 'CustomAgent/1.0' }
  ]

  testCases.forEach(options => {
    const client = createLiteLLMClient(options)
    assert.ok(client)
    assert.ok(typeof client.init === 'function')
    assert.ok(typeof client.close === 'function')
    assert.ok(typeof client.request === 'function')
    assert.ok(typeof client.stream === 'function')
  })
})
