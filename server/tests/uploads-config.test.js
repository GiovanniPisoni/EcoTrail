import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUploadsDir } from '../src/config/uploads.js'

const originalUploadsDir = process.env.UPLOADS_DIR

afterEach(() => {
  if (originalUploadsDir === undefined) {
    delete process.env.UPLOADS_DIR
  } else {
    process.env.UPLOADS_DIR = originalUploadsDir
  }
})

describe('getUploadsDir', () => {
  it('defaults to the server/uploads folder', () => {
    delete process.env.UPLOADS_DIR

    expect(getUploadsDir()).toBe(fileURLToPath(new URL('../uploads', import.meta.url)))
  })

  it('uses UPLOADS_DIR when it is set, as an absolute path', () => {
    process.env.UPLOADS_DIR = 'some/relative/folder'

    expect(getUploadsDir()).toBe(path.resolve('some/relative/folder'))
    expect(path.isAbsolute(getUploadsDir())).toBe(true)
  })

  it('reads the variable at call time', () => {
    process.env.UPLOADS_DIR = 'first'
    const first = getUploadsDir()
    process.env.UPLOADS_DIR = 'second'

    expect(getUploadsDir()).not.toBe(first)
  })
})
