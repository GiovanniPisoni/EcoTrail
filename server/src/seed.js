import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import User from './models/User.js'
import Trail from './models/Trail.js'
import { enrichTrail } from './data/enrich-trails.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rawTrails = JSON.parse(readFileSync(path.join(__dirname, 'data', 'trails-andalo.json'), 'utf-8'))
const trails = rawTrails.map(enrichTrail)

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected to MongoDB, clearing collections...')

  await User.deleteMany({})
  await Trail.deleteMany({})

  const hikerPassword = await bcrypt.hash('hiker123', 10)
  const adminPassword = await bcrypt.hash('admin123', 10)

  await User.create([
    { email: 'hiker@ecotrail.test', password: hikerPassword, role: 'hiker' },
    { email: 'admin@ecotrail.test', password: adminPassword, role: 'admin' }
  ])

  await Trail.create(trails)

  console.log(`Seed completed: 2 users and ${trails.length} trails created.`)
  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Error while seeding:', err)
  process.exit(1)
})
