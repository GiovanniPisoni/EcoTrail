import { describe, it, expect } from 'vitest'
import {
  PLACEHOLDER_PHOTO_URL,
  computeDistanceKm,
  enrichTrail,
  estimateDifficulty,
  estimateDurationMinutes,
} from '../src/data/enrich-trails.js'

describe('computeDistanceKm', () => {
  it('measures one degree of latitude as about 111.2 km', () => {
    expect(
      computeDistanceKm([
        [10, 45],
        [10, 46],
      ]),
    ).toBe(111.2)
  })

  it('sums the distance of every segment', () => {
    expect(
      computeDistanceKm([
        [0, 0],
        [0, 1],
        [0, 2],
      ]),
    ).toBe(222.4)
  })

  it('returns 0 for a single point or identical points', () => {
    expect(computeDistanceKm([[11, 44]])).toBe(0)
    expect(
      computeDistanceKm([
        [11, 44],
        [11, 44],
      ]),
    ).toBe(0)
  })

  it('rounds to one decimal place', () => {
    const km = computeDistanceKm([
      [11, 44],
      [11.013, 44.007],
    ])
    expect(km).toBe(Math.round(km * 10) / 10)
  })
})

describe('estimateDifficulty', () => {
  it('uses distance thresholds when the name gives no hint', () => {
    expect(estimateDifficulty('Giro del Lago', 5.9)).toBe('easy')
    expect(estimateDifficulty('Giro del Lago', 6)).toBe('medium')
    expect(estimateDifficulty('Giro del Lago', 14)).toBe('medium')
    expect(estimateDifficulty('Giro del Lago', 14.1)).toBe('hard')
  })

  it.each(['Sentiero attrezzato Donini', 'Sentiero ALPINISTICO Banal', 'Sentiero canalone Battisti'])(
    'marks "%s" as hard even when it is short',
    (name) => {
      expect(estimateDifficulty(name, 0.5)).toBe('hard')
    },
  )
})

describe('estimateDurationMinutes', () => {
  it('uses a slower walking speed for harder trails', () => {
    expect(estimateDurationMinutes(12, 'easy')).toBe(180)
    expect(estimateDurationMinutes(12, 'medium')).toBe(240)
    expect(estimateDurationMinutes(5, 'hard')).toBe(120)
  })

  it('rounds to the nearest 5 minutes', () => {
    expect(estimateDurationMinutes(1.3, 'easy')).toBe(20)
    expect(estimateDurationMinutes(0.4, 'hard')).toBe(10)
  })

  it('returns 0 for a zero-length trail', () => {
    expect(estimateDurationMinutes(0, 'easy')).toBe(0)
  })
})

describe('enrichTrail', () => {
  const baseTrail = {
    name: 'Giro del Lago',
    status: 'free',
    path: {
      type: 'LineString',
      coordinates: [
        [10, 45],
        [10, 45.1],
      ],
    },
  }

  it('adds distance, difficulty, duration and the placeholder photo', () => {
    const enriched = enrichTrail(baseTrail)

    expect(enriched.distanceKm).toBe(11.1)
    expect(enriched.difficulty).toBe('medium')
    expect(enriched.durationMinutes).toBe(220)
    expect(enriched.photoUrl).toBe(PLACEHOLDER_PHOTO_URL)
  })

  it('keeps the original properties and does not mutate the input', () => {
    const enriched = enrichTrail(baseTrail)

    expect(enriched.name).toBe('Giro del Lago')
    expect(enriched.status).toBe('free')
    expect(enriched.path).toBe(baseTrail.path)
    expect(baseTrail).not.toHaveProperty('distanceKm')
  })

  it('does not overwrite values that are already present', () => {
    const enriched = enrichTrail({
      ...baseTrail,
      distanceKm: 3,
      difficulty: 'easy',
      durationMinutes: 45,
      photoUrl: 'https://example.test/trail.jpg',
    })

    expect(enriched.distanceKm).toBe(3)
    expect(enriched.difficulty).toBe('easy')
    expect(enriched.durationMinutes).toBe(45)
    expect(enriched.photoUrl).toBe('https://example.test/trail.jpg')
  })
})
