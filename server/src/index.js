import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import authRouter from './routes/auth.js'
import pushRouter from './routes/push.js'
import trailsRouter from './routes/trails.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/push', pushRouter)
app.use('/api/trails', trailsRouter)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3000

  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`)
      })
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err)
      process.exit(1)
    })
}

export default app
