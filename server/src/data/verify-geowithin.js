import 'dotenv/config'
import mongoose from 'mongoose'
import Trail from '../models/Trail.js'

const bbox = {
  type: 'Polygon',
  coordinates: [
    [
      [10.85, 46.05],
      [11.15, 46.05],
      [11.15, 46.25],
      [10.85, 46.25],
      [10.85, 46.05]
    ]
  ]
}

await mongoose.connect(process.env.MONGODB_URI)

const trailsInArea = await Trail.find({
  path: { $geoWithin: { $geometry: bbox } }
}).select('name')

console.log(`Sentieri trovati nel rettangolo dell'area pilota: ${trailsInArea.length}`)
for (const t of trailsInArea) {
  console.log(' -', t.name)
}

await mongoose.connection.close()
