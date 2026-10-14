import 'dotenv/config'
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import User from '../../src/models/User.js'
import Trail from '../../src/models/Trail.js'
import { saveUserPosition } from '../../src/services/presence/userPresence.js'

export const DEFAULT_TRAIL = 'Sentiero della Ceda'

export async function placeUserOnTrail({ email, trailName = DEFAULT_TRAIL }) {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() })
  if (!user) throw new Error(`No account with the email ${email}`)

  const trail = await Trail.findOne({ name: trailName })
  if (!trail) throw new Error(`No trail called "${trailName}"`)

  const { coordinates } = trail.path
  const [longitude, latitude] = coordinates[Math.floor(coordinates.length / 2)]
  await saveUserPosition(user._id, { latitude, longitude })

  return { email: user.email, trail: trail.name, latitude, longitude }
}

function readOption(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const email = readOption(args, '--user')

  if (!email) {
    console.log('Usage: npm run simulate:presence -w server -- --user <email> [--trail <name>]')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)
  const placed = await placeUserOnTrail({ email, trailName: readOption(args, '--trail') })
  console.log(`${placed.email} is now on "${placed.trail}" (valid for 15 minutes).`)
  await mongoose.connection.close()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error while placing the user:', err.message)
    process.exit(1)
  })
}
