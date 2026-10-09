import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { createClientRouter } from '../../src/middleware/serveClient.js'

let distDir
let app

beforeAll(async () => {
  distDir = await mkdtemp(path.join(os.tmpdir(), 'ecotrail-dist-'))
  await mkdir(path.join(distDir, 'assets'))
  await writeFile(path.join(distDir, 'index.html'), '<html><body>EcoTrail app</body></html>')
  await writeFile(path.join(distDir, 'service-worker.js'), 'self.skipWaiting()')
  await writeFile(path.join(distDir, 'assets', 'index-4f9a2c.js'), 'console.log(1)')

  app = express()
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
  app.use(createClientRouter(distDir))
})

afterAll(async () => {
  await rm(distDir, { recursive: true, force: true })
})

describe('serving the built client', () => {
  it('serves the app on the root path', async () => {
    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.text).toContain('EcoTrail app')
  })

  it.each(['/login', '/admin/trails', '/profile'])(
    'answers the browser route %s with the app',
    async (route) => {
      const res = await request(app).get(route)

      expect(res.status).toBe(200)
      expect(res.text).toContain('EcoTrail app')
      expect(res.headers['cache-control']).toBe('no-cache')
    }
  )

  it('keeps the API routes untouched', async () => {
    const res = await request(app).get('/api/health')

    expect(res.body).toEqual({ status: 'ok' })
  })

  it.each(['/api/unknown', '/api/uploads/reports/x', '/socket.io/'])(
    'does not answer %s with the app',
    async (route) => {
      const res = await request(app).get(route)

      expect(res.status).toBe(404)
      expect(res.text).not.toContain('EcoTrail app')
    }
  )

  it('returns 404 for a file that does not exist instead of the app', async () => {
    const res = await request(app).get('/assets/missing-1a2b3c.js')

    expect(res.status).toBe(404)
  })

  it('lets browsers keep hashed assets for a year', async () => {
    const res = await request(app).get('/assets/index-4f9a2c.js')

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('max-age=31536000')
    expect(res.headers['cache-control']).toContain('immutable')
  })

  it('never lets browsers keep the service worker or the app page', async () => {
    const worker = await request(app).get('/service-worker.js')
    const page = await request(app).get('/')

    expect(worker.headers['cache-control']).toBe('no-cache')
    expect(page.headers['cache-control']).toBe('no-cache')
  })

  it('does not answer POST requests with the app', async () => {
    const res = await request(app).post('/login')

    expect(res.status).toBe(404)
  })
})

describe('createClientRouter', () => {
  it('returns null when the client has not been built', () => {
    expect(createClientRouter(path.join(os.tmpdir(), 'ecotrail-not-built'))).toBeNull()
  })
})
