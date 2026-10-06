import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { generateJson, isLlmConfigured, DEFAULT_AI_MODEL } from '../src/services/llm.js'

const SCHEMA = { type: 'OBJECT', properties: { reason: { type: 'STRING' } } }

function geminiResponse(text, init = {}) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
    ...init
  })
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'secret-test-key'
  delete process.env.AI_MODEL
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GEMINI_API_KEY
  delete process.env.AI_MODEL
})

describe('isLlmConfigured', () => {
  it('is true only when the key is set', () => {
    expect(isLlmConfigured()).toBe(true)
    delete process.env.GEMINI_API_KEY
    expect(isLlmConfigured()).toBe(false)
  })
})

describe('generateJson', () => {
  it('sends the prompt with the key in a header and returns the parsed answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse('{"reason":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)

    const answer = await generateJson('Hello', SCHEMA)

    expect(answer).toEqual({ reason: 'ok' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain(`/models/${DEFAULT_AI_MODEL}:generateContent`)
    expect(url).not.toContain('secret-test-key')
    expect(options.headers['x-goog-api-key']).toBe('secret-test-key')
    const body = JSON.parse(options.body)
    expect(body.contents[0].parts[0].text).toBe('Hello')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema).toEqual(SCHEMA)
  })

  it('uses the model set in the environment', async () => {
    process.env.AI_MODEL = 'my-model'
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse('{}'))
    vi.stubGlobal('fetch', fetchMock)

    await generateJson('Hello', SCHEMA)

    expect(fetchMock.mock.calls[0][0]).toContain('/models/my-model:generateContent')
  })

  it('fails without calling the provider when there is no key', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateJson('Hello', SCHEMA)).rejects.toThrow(/GEMINI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails on an error status without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota', { status: 429 })))

    const error = await generateJson('Hello', SCHEMA).catch((err) => err)

    expect(error.message).toMatch(/429/)
    expect(error.message).not.toContain('secret-test-key')
  })

  it('fails when the answer has no text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }))
    )

    await expect(generateJson('Hello', SCHEMA)).rejects.toThrow(/no text/)
  })

  it('fails when the answer is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiResponse('not json')))

    await expect(generateJson('Hello', SCHEMA)).rejects.toThrow()
  })

  it('gives up when the provider takes too long', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason))
          })
      )
    )

    await expect(generateJson('Hello', SCHEMA, { timeoutMs: 20 })).rejects.toThrow()
  })
})
