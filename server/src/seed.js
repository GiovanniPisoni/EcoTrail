import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import User from './models/User.js'
import Trail from './models/Trail.js'
import Report from './models/Report.js'
import { enrichTrail } from './data/enrich-trails.js'
import { deleteAllReportPhotos } from './services/reportPhoto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rawTrails = JSON.parse(
  readFileSync(path.join(__dirname, 'data', 'trails-andalo.json'), 'utf-8')
)
const trails = rawTrails.map(enrichTrail)

const HOURS_AGO = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000)


const FAKE_REPORTS = [
  { type: 'fallen_tree', severity: 'high', validationStatus: 'validated', createdAt: HOURS_AGO(3) },
  {
    type: 'overcrowding',
    severity: 'low',
    validationStatus: 'validated',
    createdAt: HOURS_AGO(18)
  },
  { type: 'landslide', severity: 'high', validationStatus: 'validated', createdAt: HOURS_AGO(60) },
  {
    type: 'flooding',
    severity: 'medium',
    validationStatus: 'validated',
    createdAt: HOURS_AGO(24 * 10)
  },
  {
    type: 'vegetation_damage',
    severity: 'low',
    validationStatus: 'validated',
    createdAt: HOURS_AGO(24 * 25)
  },
  {
    type: 'other',
    severity: 'medium',
    validationStatus: 'validated',
    createdAt: HOURS_AGO(24 * 45)
  },
  { type: 'fallen_tree', severity: 'medium', validationStatus: 'pending', createdAt: HOURS_AGO(2) },
  { type: 'overcrowding', severity: 'high', validationStatus: 'rejected', createdAt: HOURS_AGO(5) }
]

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connected to MongoDB, clearing collections...')

  await User.deleteMany({})
  await Trail.deleteMany({})
  await Report.deleteMany({})
  await deleteAllReportPhotos()

  const hikerPassword = await bcrypt.hash('hiker123', 10)
  const adminPassword = await bcrypt.hash('admin123', 10)

  await User.create([
    { email: 'hiker@ecotrail.test', password: hikerPassword, role: 'hiker' },
    { email: 'admin@ecotrail.test', password: adminPassword, role: 'admin' }
  ])

  const [hiker] = await User.find({ role: 'hiker' })
  const createdTrails = await Trail.create(trails)

  const fakeReports = FAKE_REPORTS.map((report, index) => {
    const trail = createdTrails[index % createdTrails.length]
    const [longitude, latitude] = trail.path.coordinates[0]

    return {
      author: hiker._id,
      trail: trail._id,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      description: `Seed report on ${trail.name}`,
      ...report
    }
  })
  await Report.create(fakeReports)

  console.log(
    `Seed completed: 2 users, ${trails.length} trails and ${fakeReports.length} reports created.`
  )
  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Error while seeding:', err)
  process.exit(1)
})
