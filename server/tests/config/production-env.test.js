import { describe, it, expect } from 'vitest'
import { findProductionEnvProblems } from '../../src/config/productionEnv.js'

const valid = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/EcoTrail',
  JWT_SECRET: 'a-long-random-secret',
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key'
}

describe('findProductionEnvProblems', () => {
  it('finds nothing when everything is set', () => {
    expect(findProductionEnvProblems(valid)).toEqual([])
  })

  it('names every missing variable', () => {
    const problems = findProductionEnvProblems({ MONGODB_URI: valid.MONGODB_URI })

    expect(problems).toEqual([
      'JWT_SECRET is not set',
      'VAPID_PUBLIC_KEY is not set',
      'VAPID_PRIVATE_KEY is not set'
    ])
  })

  it('treats an empty value as missing', () => {
    expect(findProductionEnvProblems({ ...valid, JWT_SECRET: '' })).toEqual([
      'JWT_SECRET is not set'
    ])
  })

  it('refuses the placeholders copied from .env.example', () => {
    const problems = findProductionEnvProblems({
      ...valid,
      JWT_SECRET: 'your_jwt_secret_key',
      VAPID_PUBLIC_KEY: 'your_vapid_public_key'
    })

    expect(problems).toEqual([
      'JWT_SECRET still has the value from .env.example',
      'VAPID_PUBLIC_KEY still has the value from .env.example'
    ])
  })
})
