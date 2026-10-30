import mongoose from 'mongoose'

const reportPhotoSchema = new mongoose.Schema(
  {
    _id: { type: String },
    data: { type: Buffer, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export default mongoose.model('ReportPhoto', reportPhotoSchema)
