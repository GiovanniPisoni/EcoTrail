import mongoose from 'mongoose'

const trailStatusHistorySchema = new mongoose.Schema(
  {
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
    previousStatus: { type: String, enum: ['free', 'crowded', 'at_risk', 'closed'], required: true },
    newStatus: { type: String, enum: ['free', 'crowded', 'at_risk', 'closed'], required: true },
    reason: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'changedAt', updatedAt: false } },
)

trailStatusHistorySchema.index({ trail: 1, changedAt: -1 })

export default mongoose.model('TrailStatusHistory', trailStatusHistorySchema)
