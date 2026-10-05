import mongoose from 'mongoose'

const sentAlertSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },
    status: { type: String, enum: ['crowded', 'at_risk', 'closed', 'report'], required: true },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' }
  },
  { timestamps: { createdAt: 'sentAt', updatedAt: false } }
)

sentAlertSchema.index({ user: 1, trail: 1, status: 1, report: 1 }, { unique: true })

export default mongoose.model('SentAlert', sentAlertSchema)
