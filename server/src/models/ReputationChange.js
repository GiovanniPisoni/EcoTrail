import mongoose from 'mongoose'

export const REPUTATION_CHANGE_REASONS = [
  'report_validated',
  'validation_revoked',
  'spam',
  'spam_reverted'
]

const reputationChangeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    delta: { type: Number, required: true },
    reason: { type: String, enum: REPUTATION_CHANGE_REASONS, required: true },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

reputationChangeSchema.index({ user: 1, createdAt: -1 })

export default mongoose.model('ReputationChange', reputationChangeSchema)
