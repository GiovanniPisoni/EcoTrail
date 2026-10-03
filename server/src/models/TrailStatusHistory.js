import mongoose from 'mongoose'
import { TRAIL_STATUSES } from './Trail.js'

const trailStatusHistorySchema = new mongoose.Schema(
  {
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
    previousStatus: { type: String, enum: TRAIL_STATUSES, required: true },
    newStatus: { type: String, enum: TRAIL_STATUSES, required: true },
    reason: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: { createdAt: 'changedAt', updatedAt: false } }
)

trailStatusHistorySchema.index({ trail: 1, changedAt: -1 })

export default mongoose.model('TrailStatusHistory', trailStatusHistorySchema)
