import mongoose from 'mongoose'

export const ACTIVITY_RETENTION_SECONDS = 365 * 24 * 60 * 60

const trailActivitySchema = new mongoose.Schema({
  trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
  hour: { type: Date, required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
})

trailActivitySchema.index({ trail: 1, hour: 1 }, { unique: true })
trailActivitySchema.index({ hour: 1 }, { expireAfterSeconds: ACTIVITY_RETENTION_SECONDS })

export default mongoose.model('TrailActivity', trailActivitySchema)
