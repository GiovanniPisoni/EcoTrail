export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? 'mongodb://localhost:27017/EcoTrail_e2e'

export const E2E_USERS = {
  hiker: { email: 'hiker@ecotrail.test', password: 'hiker123' },
  admin: { email: 'admin@ecotrail.test', password: 'admin123' }
}

export const E2E_TRAIL_NAME = 'Sentiero della Ceda'
