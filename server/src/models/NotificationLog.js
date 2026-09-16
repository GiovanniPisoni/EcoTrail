import mongoose from 'mongoose'

const notificationLogSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['emergency', 'approach', 'overcrowd'], required: true },
    relatedTrail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail' },
    relatedReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    message: { type: String, required: true },
  },
  { timestamps: { createdAt: 'sentAt', updatedAt: false } },
)

notificationLogSchema.index({ recipient: 1, sentAt: -1 })

export default mongoose.model('NotificationLog', notificationLogSchema)
