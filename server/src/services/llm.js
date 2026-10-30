const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export const DEFAULT_AI_MODEL = 'gemini-3.5-flash-lite'
export const LLM_TIMEOUT_MS = 8000

export function isLlmConfigured() {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function generateJson(prompt, responseSchema, { timeoutMs = LLM_TIMEOUT_MS } = {}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const model = process.env.AI_MODEL || DEFAULT_AI_MODEL
  const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.3,
        maxOutputTokens: 1024
      }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  })

  if (!response.ok) throw new Error(`LLM request failed with status ${response.status}`)

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
  if (!text) throw new Error('LLM returned no text')

  return JSON.parse(text)
}
