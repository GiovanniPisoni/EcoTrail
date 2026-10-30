import mongoose from 'mongoose'

export const REPORT_TYPES = [
  'fallen_tree',
  'landslide',
  'flooding',
  'vegetation_damage',
  'overcrowding',
  'other'
]
export const REPORT_SEVERITIES = ['low', 'medium', 'high']

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  { _id: false }
)

const reportSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: REPORT_TYPES, required: true },
    severity: { type: String, enum: REPORT_SEVERITIES, required: true },
    description: { type: String },
    photoUrl: { type: String },
    location: { type: pointSchema, required: true },
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },

    validationStatus: {
      type: String,
      enum: ['pending', 'validated', 'rejected', 'withdrawn'],
      default: 'pending'
    },
    validationNote: { type: String },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validatedAt: { type: Date },
    trustScore: { type: Number, default: 0 },
    isSuspicious: { type: Boolean, default: false },
    markedAsSpam: { type: Boolean, default: false },
    spamPenalty: { type: Number, default: 0 },
    clientId: { type: String }
  },
  { timestamps: true }
)

reportSchema.index({ location: '2dsphere' })
reportSchema.index(
  { author: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
)

export default mongoose.model('Report', reportSchema)
