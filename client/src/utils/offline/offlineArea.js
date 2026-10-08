import api from '@/api/client.js'

const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
const MIN_ZOOM = 10
const MAX_ZOOM = 16
const ZOOM_LEVELS_BELOW = 1
const ZOOM_LEVELS_ABOVE = 2
const MAX_TILES = 400
const TILE_CONCURRENCY = 4
const MAX_TRAIL_DETAILS = 50

function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom)
}

function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom)
}

export function listTiles(bounds, currentZoom) {
  const firstZoom = Math.max(MIN_ZOOM, currentZoom - ZOOM_LEVELS_BELOW)
  const lastZoom = Math.min(MAX_ZOOM, currentZoom + ZOOM_LEVELS_ABOVE)
  const tiles = []

  for (let z = firstZoom; z <= lastZoom; z++) {
    const xMin = lonToTileX(bounds.getWest(), z)
    const xMax = lonToTileX(bounds.getEast(), z)
    const yMin = latToTileY(bounds.getNorth(), z)
    const yMax = latToTileY(bounds.getSouth(), z)
    const count = (xMax - xMin + 1) * (yMax - yMin + 1)

    if (tiles.length + count > MAX_TILES) break

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) tiles.push([z, x, y])
    }
  }

  return tiles
}

async function runLimited(items, limit, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

export async function downloadArea(map, onProgress = () => {}) {
  if (!navigator.onLine) throw new Error('You need a connection to download an area.')
  if (!navigator.serviceWorker?.controller) {
    throw new Error('Offline mode is not ready yet. Reload the page and try again.')
  }

  const bounds = map.getBounds()
  const tiles = listTiles(bounds, Math.round(map.getZoom()))
  if (tiles.length === 0) throw new Error('The area is too large. Zoom in and try again.')

  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
  const [{ data: trails }] = await Promise.all([
    api.get('/trails', { params: { bbox } }),
    api.get('/reports', { params: { bbox } })
  ])

  const trailIds = (trails.features ?? []).slice(0, MAX_TRAIL_DETAILS).map((f) => f.properties.id)
  const total = tiles.length + trailIds.length
  let done = 0
  const step = () => onProgress(++done / total)

  await runLimited(trailIds, TILE_CONCURRENCY, async (id) => {
    await api.get(`/trails/${id}`).catch(() => {})
    step()
  })

  let failed = 0
  await runLimited(tiles, TILE_CONCURRENCY, async ([z, x, y]) => {
    try {
      const response = await fetch(TILE_URL(z, x, y), { mode: 'cors', credentials: 'omit' })
      if (!response.ok) failed++
    } catch {
      failed++
    }
    step()
  })

  return { tiles: tiles.length, failed, trails: trailIds.length }
}
