import mongoose from 'mongoose'

export const NOTIFICATION_TYPES = ['emergency', 'approach', 'overcrowd']
export const NOTIFICATION_RETENTION_SECONDS = 30 * 24 * 60 * 60

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail' },
  title: { type: String, required: true },
  body: { type: String },
  url: { type: String },
  sentAt: { type: Date, default: Date.now },
  readAt: { type: Date, default: null }
})

notificationSchema.index({ user: 1, sentAt: -1 })
notificationSchema.index({ sentAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS })

export default mongoose.model('Notification', notificationSchema)
