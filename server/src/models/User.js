import mongoose from 'mongoose'

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true, _id: false },
)

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['hiker', 'admin'], default: 'hiker' },
    reputation: { type: Number, default: 0 },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },

    notificationPreferences: {
      radiusMeters: { type: Number, default: 1000 },
      alertTypes: { type: [String], default: ['emergency', 'approach', 'overcrowd'] },
    },
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema)
