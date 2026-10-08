import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'

vi.mock('../../../src/services/llm.js', () => ({
  isLlmConfigured: vi.fn(),
  generateJson: vi.fn()
}))

import { isLlmConfigured, generateJson } from '../../../src/services/llm.js'
import app from '../../../src/index.js'
import Trail from '../../../src/models/Trail.js'
import {
  AI_CACHE_TTL_MS,
  FALLBACK_CACHE_TTL_MS,
  MAX_REASON_LENGTH,
  clearAlternativeCache,
  getAlternative
} from '../../../src/services/trails/aiAlternatives.js'

let mongod
let closed
let freeNear
let crowdedNear
let farAway

function trailAt(name, latitude, extra = {}) {
  return Trail.create({
    name,
    distanceKm: 5,
    durationMinutes: 120,
    difficulty: 'easy',
    path: {
      type: 'LineString',
      coordinates: [
        [10.9, latitude],
        [10.91, latitude]
      ]
    },
    ...extra
  })
}

function answerWith(trail, reason = 'Because it is quiet and similar in length.') {
  return { trailId: String(trail._id), reason }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await Trail.init()
})

afterAll(async () => {
  await mongoose.connection.close()
  await mongod.stop()
})

beforeEach(async () => {
  vi.clearAllMocks()
  clearAlternativeCache()
  isLlmConfigured.mockReturnValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  await Trail.deleteMany({})
  closed = await trailAt('Closed trail', 46.18, { status: 'closed' })
  freeNear = await trailAt('Free trail', 46.185)
  crowdedNear = await trailAt('Crowded trail', 46.19, { status: 'crowded' })
  await trailAt('Another closed trail', 46.186, { status: 'closed' })
  farAway = await trailAt('Far trail', 46.5)
})

describe('getAlternative with the AI', () => {
  it('returns the alternative chosen by the model with its reason', async () => {
    generateJson.mockResolvedValue(answerWith(crowdedNear, 'It is the only other option.'))

    const result = await getAlternative(closed)

    expect(result.source).toBe('ai')
    expect(result.alternative.id).toBe(String(crowdedNear._id))
    expect(result.alternative.name).toBe('Crowded trail')
    expect(result.reason).toBe('It is the only other option.')
  })

  it('sends only nearby trails that are not closed', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear))

    await getAlternative(closed)

    const prompt = generateJson.mock.calls[0][0]
    expect(prompt).toContain('Free trail')
    expect(prompt).toContain('Crowded trail')
    expect(prompt).not.toContain('Another closed trail')
    expect(prompt).not.toContain('Far trail')
  })

  it('trims the reason and keeps it short', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear, `  ${'a'.repeat(1000)}  `))

    const result = await getAlternative(closed)

    expect(result.reason).toHaveLength(MAX_REASON_LENGTH)
  })
})

describe('getAlternative fallback', () => {
  it('uses the closest free trail when the model chooses a trail that was not offered', async () => {
    generateJson.mockResolvedValue(answerWith(farAway))

    const result = await getAlternative(closed)

    expect(result.source).toBe('fallback')
    expect(result.alternative.id).toBe(String(freeNear._id))
  })

  it('uses the closest free trail when the model answers without a reason', async () => {
    generateJson.mockResolvedValue({ trailId: String(freeNear._id), reason: '   ' })

    const result = await getAlternative(closed)

    expect(result.source).toBe('fallback')
  })

  it('uses the closest free trail when the model fails', async () => {
    generateJson.mockRejectedValue(new Error('LLM request failed with status 500'))

    const result = await getAlternative(closed)

    expect(result.source).toBe('fallback')
    expect(result.alternative.id).toBe(String(freeNear._id))
    expect(result.reason).toContain('Free trail')
  })

  it('does not call the model when it is not configured', async () => {
    isLlmConfigured.mockReturnValue(false)

    const result = await getAlternative(closed)

    expect(generateJson).not.toHaveBeenCalled()
    expect(result.source).toBe('fallback')
    expect(result.alternative.id).toBe(String(freeNear._id))
  })

  it('has no alternative when no free trail is nearby', async () => {
    isLlmConfigured.mockReturnValue(false)
    await Trail.updateOne({ _id: freeNear._id }, { status: 'at_risk' })

    const result = await getAlternative(closed)

    expect(result.alternative).toBeNull()
    expect(result.source).toBe('fallback')
  })

  it('has no alternative and does not call the model when no trail is nearby', async () => {
    const result = await getAlternative(farAway)

    expect(generateJson).not.toHaveBeenCalled()
    expect(result.alternative).toBeNull()
  })
})

describe('getAlternative cache', () => {
  it('asks the model only once for the same situation', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear))

    await getAlternative(closed)
    await getAlternative(closed)

    expect(generateJson).toHaveBeenCalledTimes(1)
  })

  it('asks again once the answer has expired', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear))
    const start = Date.now()

    await getAlternative(closed, { now: start })
    await getAlternative(closed, { now: start + AI_CACHE_TTL_MS + 1 })

    expect(generateJson).toHaveBeenCalledTimes(2)
  })

  it('asks again when the state of the nearby trails changes', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear))
    await getAlternative(closed)

    await Trail.updateOne({ _id: freeNear._id }, { status: 'crowded' })
    await getAlternative(closed)

    expect(generateJson).toHaveBeenCalledTimes(2)
  })

  it('remembers a failure only for a short time', async () => {
    generateJson.mockRejectedValue(new Error('down'))
    const start = Date.now()

    await getAlternative(closed, { now: start })
    await getAlternative(closed, { now: start + FALLBACK_CACHE_TTL_MS - 1 })
    expect(generateJson).toHaveBeenCalledTimes(1)

    await getAlternative(closed, { now: start + FALLBACK_CACHE_TTL_MS + 1 })
    expect(generateJson).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/trails/:id/alternative', () => {
  it('returns the suggestion for a closed trail', async () => {
    generateJson.mockResolvedValue(answerWith(freeNear))

    const res = await request(app).get(`/api/trails/${closed._id}/alternative`)

    expect(res.status).toBe(200)
    expect(res.body.source).toBe('ai')
    expect(res.body.alternative.name).toBe('Free trail')
    expect(res.body.reason).toBeTruthy()
  })

  it.each(['crowded', 'at_risk'])('also works for a trail that is %s', async (status) => {
    generateJson.mockResolvedValue(answerWith(freeNear))
    const trail = await trailAt(`Trail ${status}`, 46.18, { status })

    const res = await request(app).get(`/api/trails/${trail._id}/alternative`)

    expect(res.status).toBe(200)
    expect(res.body.alternative.id).toBe(String(freeNear._id))
  })

  it('has nothing to suggest for a free trail', async () => {
    const res = await request(app).get(`/api/trails/${freeNear._id}/alternative`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ alternative: null, reason: null, source: null })
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('still answers when the model is down', async () => {
    generateJson.mockRejectedValue(new Error('down'))

    const res = await request(app).get(`/api/trails/${closed._id}/alternative`)

    expect(res.status).toBe(200)
    expect(res.body.source).toBe('fallback')
    expect(res.body.alternative.name).toBe('Free trail')
  })

  it('rejects an invalid id', async () => {
    const res = await request(app).get('/api/trails/abc/alternative')

    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown trail', async () => {
    const res = await request(app).get(`/api/trails/${new mongoose.Types.ObjectId()}/alternative`)

    expect(res.status).toBe(404)
  })
})
