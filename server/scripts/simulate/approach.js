import 'dotenv/config'
import mongoose from 'mongoose'
import Trail from '../../src/models/Trail.js'
import User from '../../src/models/User.js'
import SentAlert from '../../src/models/SentAlert.js'
import { saveUserPosition } from '../../src/services/presence/userPresence.js'
import {
  checkApproachAlerts,
  DANGEROUS_TRAIL_STATUSES
} from '../../src/services/notifications/checkApproachAlerts.js'

const DEFAULT_EMAIL = 'hiker@ecotrail.test'
const DEFAULT_START_DISTANCE_METERS = 3000
const DEFAULT_STEPS = 8
const LINGER_STEPS = 4
const METERS_PER_DEGREE = 111320

function parseArgs(argv) {
  const options = { user: DEFAULT_EMAIL, trail: null, from: DEFAULT_START_DISTANCE_METERS }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--user') options.user = argv[++i]
    else if (argv[i] === '--trail') options.trail = argv[++i]
    else if (argv[i] === '--from') options.from = Number(argv[++i])
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log(
    '  npm run simulate:approach -w server -- --trail <name or id> [--user <email>] [--from <meters>]'
  )
}

async function findTrail(query) {
  if (mongoose.Types.ObjectId.isValid(query)) {
    const byId = await Trail.findById(query)
    if (byId) return byId
  }
  return Trail.findOne({ name: query })
}

async function moveTo(user, point, label) {
  await saveUserPosition(user._id, point)
  const sent = await checkApproachAlerts(user._id, point)
  console.log(`${label}: ${sent === 0 ? 'no new alert' : `${sent} alert sent`}`)
}

async function main() {
  const { user: email, trail: trailQuery, from } = parseArgs(process.argv.slice(2))

  if (!trailQuery || !Number.isFinite(from) || from <= 0) {
    usage()
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  try {
    const [user, trail] = await Promise.all([User.findOne({ email }), findTrail(trailQuery)])
    if (!user) {
      console.error(`User "${email}" not found`)
      process.exit(1)
    }
    if (!trail) {
      console.error(`Trail "${trailQuery}" not found`)
      process.exit(1)
    }
    if (!DANGEROUS_TRAIL_STATUSES.includes(trail.status)) {
      console.error(
        `"${trail.name}" is "${trail.status}": close it or mark it at risk from the admin panel first`
      )
      process.exit(1)
    }

    await SentAlert.deleteMany({ user: user._id, trail: trail._id })

    const [longitude, latitude] = trail.path.coordinates[0]
    console.log(`Walking ${email} towards "${trail.name}" (${trail.status}), from ${from} m away`)

    for (let step = 0; step <= DEFAULT_STEPS; step++) {
      const distance = Math.round(from * (1 - step / DEFAULT_STEPS))
      const point = { latitude: latitude + distance / METERS_PER_DEGREE, longitude }
      await moveTo(user, point, `~${distance} m from the trail`)
    }

    for (let step = 1; step <= LINGER_STEPS; step++) {
      const point = {
        latitude: latitude + (step * 10) / METERS_PER_DEGREE,
        longitude:
          longitude + (step * 10) / (METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180))
      }
      await moveTo(user, point, `Moving around the trail (${step}/${LINGER_STEPS})`)
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
