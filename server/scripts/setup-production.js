import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import User from '../src/models/User.js'
import Trail from '../src/models/Trail.js'
import { enrichTrail } from './data/enrich-trails.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const MIN_ADMIN_PASSWORD_LENGTH = 10

export function loadTrails() {
  const rawTrails = JSON.parse(
    readFileSync(path.join(__dirname, '..', 'data', 'trails-andalo.json'), 'utf-8')
  )
  return rawTrails.map(enrichTrail)
}

// Adds the trails that are not in the database yet and leaves the others as
// they are, so their status and history survive running the script again.
export async function ensureTrails(trails = loadTrails()) {
  const existing = new Set((await Trail.find({}, 'name').lean()).map((trail) => trail.name))
  const missing = trails.filter((trail) => !existing.has(trail.name))

  if (missing.length > 0) await Trail.create(missing)

  return { created: missing.length, existing: trails.length - missing.length }
}

export async function ensureAdmin({ email, password }) {
  if (!email) throw new Error('ADMIN_EMAIL is not set')
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must have at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`)
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() })

  if (user?.role === 'admin') return 'already-admin'

  if (user) {
    user.role = 'admin'
    await user.save()
    return 'promoted'
  }

  await User.create({
    email,
    password: await bcrypt.hash(password, 10),
    role: 'admin'
  })
  return 'created'
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)

  const trails = await ensureTrails()
  console.log(`Trails: ${trails.created} created, ${trails.existing} already there.`)

  const admin = await ensureAdmin({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  })
  const messages = {
    created: 'Admin account created.',
    promoted: 'The account already existed and is now an admin.',
    'already-admin': 'The admin account already exists, nothing changed.'
  }
  console.log(messages[admin])

  await mongoose.connection.close()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error while setting up the database:', err.message)
    process.exit(1)
  })
}
