import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, 
  },
  { _id: false },
)

const userPresenceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  location: { type: pointSchema, required: true },
  updatedAt: { type: Date, default: Date.now },
})

userPresenceSchema.index({ location: '2dsphere' })
userPresenceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 900 })

export default mongoose.model('UserPresence', userPresenceSchema)
