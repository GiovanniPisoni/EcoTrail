import mongoose from 'mongoose'

export const TRAIL_STATUSES = ['free', 'crowded', 'at_risk', 'closed']

const lineStringSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['LineString'], default: 'LineString' },
    coordinates: { type: [[Number]], required: true },
  },
  { _id: false },
)

const fragileSegmentSchema = new mongoose.Schema(
  {
    label: { type: String },
    path: { type: lineStringSchema, required: true },
  },
  { _id: false },
)

const trailSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    path: { type: lineStringSchema, required: true },
    status: {
      type: String,
      enum: TRAIL_STATUSES,
      default: 'free',
    },
    distanceKm: { type: Number, min: 0 },
    durationMinutes: { type: Number, min: 0 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    photoUrl: { type: String },
    fragileSegments: { type: [fragileSegmentSchema], default: [] },
  },
  { timestamps: true },
)

trailSchema.index({ path: '2dsphere' })
trailSchema.index({ 'fragileSegments.path': '2dsphere' })

export default mongoose.model('Trail', trailSchema)
