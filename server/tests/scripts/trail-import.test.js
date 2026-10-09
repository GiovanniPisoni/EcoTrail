import { describe, it, expect } from 'vitest'
import {
  difficultyFromCaiScale,
  featureToTrail,
  importTrails,
  parseOsmDurationMinutes,
  selectTrailFeatures,
  simplifyLine
} from '../../scripts/data/trail-import.js'

function line(
  id,
  name,
  properties = {},
  coordinates = [
    [10, 46],
    [10.01, 46.01]
  ]
) {
  return {
    type: 'Feature',
    properties: { '@id': id, name, ...properties },
    geometry: { type: 'LineString', coordinates }
  }
}

const collection = (...features) => ({ type: 'FeatureCollection', features })

describe('selectTrailFeatures', () => {
  it('keeps named relations and ways with a sac_scale', () => {
    const result = selectTrailFeatures(
      collection(
        line('relation/1', 'Route'),
        line('way/2', 'Path', { sac_scale: 'hiking' }),
        line('way/3', 'Plain way'),
        line('way/4', undefined, { sac_scale: 'hiking' })
      )
    )

    expect(result.map((f) => f.properties.name)).toEqual(['Route', 'Path'])
  })

  it('drops the ways that belong to a relation already imported', () => {
    const result = selectTrailFeatures(
      collection(
        line('relation/1', 'Route'),
        line('way/2', 'Section', { sac_scale: 'hiking', '@relations': [{ rel: 1 }] })
      )
    )

    expect(result.map((f) => f.properties.name)).toEqual(['Route'])
  })

  it('drops the names that appear more than once', () => {
    const result = selectTrailFeatures(
      collection(
        line('relation/1', 'Same name'),
        line('relation/2', 'Same name'),
        line('relation/3', 'Unique')
      )
    )

    expect(result.map((f) => f.properties.name)).toEqual(['Unique'])
  })

  it('ignores geometries that are not a LineString', () => {
    const point = {
      type: 'Feature',
      properties: { '@id': 'node/1', name: 'Peak' },
      geometry: { type: 'Point', coordinates: [10, 46] }
    }

    expect(selectTrailFeatures(collection(point))).toEqual([])
  })

  it('drops the mountain bike park lines by default', () => {
    const data = collection(line('relation/1', 'Duel'), line('relation/2', 'Route'))

    expect(selectTrailFeatures(data).map((f) => f.properties.name)).toEqual(['Route'])
  })

  it('accepts custom exclusions', () => {
    const data = collection(line('relation/1', 'Route'), line('way/2', 'Skip me'))
    const exclusions = { names: new Set(['Skip me']), ids: new Set() }

    expect(selectTrailFeatures(data, exclusions)).toHaveLength(1)
  })
})

describe('simplifyLine', () => {
  const straightWithNoise = [
    [10, 46],
    [10.0005, 46.000001],
    [10.001, 46],
    [10.0015, 46.000001],
    [10.002, 46]
  ]

  it('removes the points that deviate less than the tolerance', () => {
    expect(simplifyLine(straightWithNoise, 10)).toEqual([
      [10, 46],
      [10.002, 46]
    ])
  })

  it('keeps the points that deviate more than the tolerance', () => {
    const corner = [
      [10, 46],
      [10.001, 46.001],
      [10.002, 46]
    ]

    expect(simplifyLine(corner, 10)).toEqual(corner)
  })

  it('keeps the line as it is without a tolerance', () => {
    expect(simplifyLine(straightWithNoise, 0)).toBe(straightWithNoise)
  })

  it('keeps both ends of a closed loop', () => {
    const loop = [
      [10, 46],
      [10.001, 46],
      [10.001, 46.001],
      [10, 46.001],
      [10, 46]
    ]

    const result = simplifyLine(loop, 10)

    expect(result[0]).toEqual([10, 46])
    expect(result.at(-1)).toEqual([10, 46])
    expect(result.length).toBeGreaterThan(2)
  })
})

describe('difficultyFromCaiScale', () => {
  it('maps the CAI grades to the app difficulties', () => {
    expect(difficultyFromCaiScale('T')).toBe('easy')
    expect(difficultyFromCaiScale('E')).toBe('medium')
    expect(difficultyFromCaiScale('EE')).toBe('hard')
    expect(difficultyFromCaiScale('EEA')).toBe('hard')
  })

  it('uses the hardest grade when there are several', () => {
    expect(difficultyFromCaiScale('E;EE')).toBe('hard')
    expect(difficultyFromCaiScale('t, e')).toBe('medium')
  })

  it('returns nothing for missing or unknown values', () => {
    expect(difficultyFromCaiScale(undefined)).toBeUndefined()
    expect(difficultyFromCaiScale('X')).toBeUndefined()
  })
})

describe('parseOsmDurationMinutes', () => {
  it('reads H:MM and rounds to 5 minutes', () => {
    expect(parseOsmDurationMinutes('2:30')).toBe(150)
    expect(parseOsmDurationMinutes('01:32')).toBe(90)
    expect(parseOsmDurationMinutes('3:00:00')).toBe(180)
  })

  it('returns nothing for other formats', () => {
    expect(parseOsmDurationMinutes('two hours')).toBeUndefined()
    expect(parseOsmDurationMinutes('0:00')).toBeUndefined()
    expect(parseOsmDurationMinutes(undefined)).toBeUndefined()
  })
})

describe('featureToTrail', () => {
  const coordinates = [
    [10, 46],
    [10, 46.05]
  ]

  it('builds a free trail with the distance measured on the geometry', () => {
    const trail = featureToTrail(line('relation/1', 'Route', {}, coordinates))

    expect(trail).toMatchObject({ name: 'Route', status: 'free', distanceKm: 5.6 })
    expect(trail.path).toEqual({ type: 'LineString', coordinates })
    expect(trail).not.toHaveProperty('difficulty')
    expect(trail).not.toHaveProperty('durationMinutes')
  })

  it('takes difficulty and duration from the OSM tags', () => {
    const trail = featureToTrail(
      line('relation/1', 'Route', { cai_scale: 'EE', 'duration:forward': '2:00' }, coordinates)
    )

    expect(trail.difficulty).toBe('hard')
    expect(trail.durationMinutes).toBe(120)
  })

  it('ignores a duration that does not fit the distance', () => {
    const trail = featureToTrail(
      line('relation/1', 'Route', { 'duration:forward': '0:10' }, coordinates)
    )

    expect(trail).not.toHaveProperty('durationMinutes')
  })

  it('measures the distance before simplifying', () => {
    const bumpy = [
      [10, 46],
      [10.0005, 46.000001],
      [10.001, 46]
    ]

    const trail = featureToTrail(line('relation/1', 'Route', {}, bumpy), { simplifyMeters: 10 })

    expect(trail.path.coordinates).toHaveLength(2)
  })
})

describe('importTrails', () => {
  it('selects and converts the trails of an export', () => {
    const trails = importTrails(
      collection(line('relation/1', 'Route'), line('way/2', 'Plain way')),
      { simplifyMeters: 10 }
    )

    expect(trails.map((trail) => trail.name)).toEqual(['Route'])
  })
})
