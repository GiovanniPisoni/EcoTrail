import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, 
  },
  { _id: false },
)

const reportSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['fallen_tree', 'landslide', 'flooding', 'vegetation_damage', 'overcrowding', 'other'],
      required: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    description: { type: String },
    photoUrl: { type: String },
    location: { type: pointSchema, required: true },
    trail: { type: mongoose.Schema.Types.ObjectId, ref: 'Trail', required: true },

    validationStatus: {
      type: String,
      enum: ['pending', 'validated', 'rejected'],
      default: 'pending',
    },
    validationNote: { type: String },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    validatedAt: { type: Date },
    trustScore: { type: Number, default: 0 },
    isSuspicious: { type: Boolean, default: false },
  },
  { timestamps: true },
)

reportSchema.index({ location: '2dsphere' })

export default mongoose.model('Report', reportSchema)
