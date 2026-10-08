import 'dotenv/config'
import mongoose from 'mongoose'
import Trail from '../../src/models/Trail.js'
import User from '../../src/models/User.js'
import UserPresence from '../../src/models/UserPresence.js'
import Notification from '../../src/models/Notification.js'
import { saveUserPosition } from '../../src/services/presence/userPresence.js'
import {
  checkTrailOvercrowding,
  getCrowdThresholds
} from '../../src/services/trails/overcrowding.js'

const SIMULATED_EMAIL_DOMAIN = '@simulated.ecotrail.test'

function parseArgs(argv) {
  const options = { users: null, trail: null, cleanup: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--users') options.users = Number(argv[++i])
    else if (argv[i] === '--trail') options.trail = argv[++i]
    else if (argv[i] === '--cleanup') options.cleanup = true
  }
  return options
}

function usage() {
  console.log('Usage:')
  console.log('  npm run simulate:crowd -w server -- --trail <name or id> --users <count>')
  console.log('  npm run simulate:crowd -w server -- --trail <name or id> --cleanup')
}

async function findTrail(query) {
  if (mongoose.Types.ObjectId.isValid(query)) {
    const byId = await Trail.findById(query)
    if (byId) return byId
  }
  return Trail.findOne({ name: query })
}

function pointAlongPath(coordinates, index, total) {
  const position = total === 1 ? 0 : (index / (total - 1)) * (coordinates.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(lower + 1, coordinates.length - 1)
  const fraction = position - lower
  const [lonA, latA] = coordinates[lower]
  const [lonB, latB] = coordinates[upper]
  return { longitude: lonA + (lonB - lonA) * fraction, latitude: latA + (latB - latA) * fraction }
}

async function report(trail, label) {
  const result = await checkTrailOvercrowding(trail._id)
  const refreshed = await Trail.findById(trail._id)

  if (result.count === undefined) {
    console.log(`${label}: trail is "${refreshed.status}", automatic check skipped`)
    return
  }

  const { enter, release } = getCrowdThresholds(refreshed)
  console.log(
    `${label}: ${result.count} active hikers, thresholds ${enter}/${release} -> status "${refreshed.status}"`
  )
}

async function removeSimulatedUsers() {
  const users = await User.find({ email: { $regex: `${SIMULATED_EMAIL_DOMAIN}$` } }).select('_id')
  const ids = users.map((user) => user._id)
  await Promise.all([
    UserPresence.deleteMany({ user: { $in: ids } }),
    Notification.deleteMany({ user: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } })
  ])
  return ids.length
}

async function main() {
  const { users, trail: trailQuery, cleanup } = parseArgs(process.argv.slice(2))

  if (!trailQuery || (!cleanup && !(Number.isInteger(users) && users > 0))) {
    usage()
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  try {
    const trail = await findTrail(trailQuery)
    if (!trail) {
      console.error(`Trail "${trailQuery}" not found`)
      process.exit(1)
    }

    if (cleanup) {
      const removed = await removeSimulatedUsers()
      console.log(`Removed ${removed} simulated users`)
      await report(trail, 'After cleanup')
      return
    }

    await removeSimulatedUsers()

    const coordinates = trail.path.coordinates
    for (let i = 0; i < users; i++) {
      const user = await User.create({
        email: `sim-${i + 1}${SIMULATED_EMAIL_DOMAIN}`,
        password: 'simulated'
      })
      await saveUserPosition(user._id, pointAlongPath(coordinates, i, users))
    }

    console.log(`Placed ${users} simulated hikers along "${trail.name}"`)
    await report(trail, 'After simulation')
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
