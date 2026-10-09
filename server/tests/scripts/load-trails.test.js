import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadTrails, trailDataFiles } from '../../scripts/data/load-trails.js'

const trail = (name) => ({
  name,
  path: {
    type: 'LineString',
    coordinates: [
      [10, 46],
      [10, 46.05]
    ]
  },
  status: 'free'
})

let dir

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ecotrail-trails-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(file, trails) {
  writeFileSync(path.join(dir, file), JSON.stringify(trails))
}

describe('trailDataFiles', () => {
  it('lists only the trails-<area>.json files, sorted', () => {
    write('trails-b.json', [])
    write('trails-a.json', [])
    write('other.json', [])

    expect(trailDataFiles(dir).map((file) => path.basename(file))).toEqual([
      'trails-a.json',
      'trails-b.json'
    ])
  })
})

describe('loadTrails', () => {
  it('merges the areas and enriches every trail', () => {
    write('trails-a.json', [trail('One')])
    write('trails-b.json', [trail('Two')])

    const trails = loadTrails(dir)

    expect(trails.map((t) => t.name)).toEqual(['One', 'Two'])
    expect(trails[0]).toHaveProperty('difficulty')
    expect(trails[0]).toHaveProperty('photoUrl')
  })

  it('keeps a trail that appears in more than one area only once, from the first file', () => {
    write('trails-a.json', [{ ...trail('Shared'), difficulty: 'easy' }])
    write('trails-b.json', [{ ...trail('Shared'), difficulty: 'hard' }, trail('Other')])

    const trails = loadTrails(dir)

    expect(trails.map((t) => t.name)).toEqual(['Shared', 'Other'])
    expect(trails[0].difficulty).toBe('easy')
  })
})
