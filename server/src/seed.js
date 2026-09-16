import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import User from './models/User.js'
import Trail from './models/Trail.js'

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Connesso a MongoDB, svuoto le collezioni...')

  await User.deleteMany({})
  await Trail.deleteMany({})

  const hikerPassword = await bcrypt.hash('hiker123', 10)
  const adminPassword = await bcrypt.hash('admin123', 10)

  await User.create([
    { email: 'hiker@ecotrail.test', password: hikerPassword, role: 'hiker' },
    { email: 'admin@ecotrail.test', password: adminPassword, role: 'admin' },
  ])

  await Trail.create([
    {
      name: 'Sentiero di prova 1',
      path: {
        type: 'LineString',
        coordinates: [
          [11.1, 44.5],
          [11.12, 44.52],
        ],
      },
      status: 'free',
    },
    {
      name: 'Sentiero di prova 2',
      path: {
        type: 'LineString',
        coordinates: [
          [11.2, 44.6],
          [11.22, 44.62],
        ],
      },
      status: 'free',
    },
  ])

  console.log('Seed completato: 2 utenti e 2 sentieri creati.')
  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Errore durante il seed:', err)
  process.exit(1)
})
