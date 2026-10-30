import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import authRouter from './routes/auth.js'
import pushRouter from './routes/push.js'
import trailsRouter from './routes/trails.js'
import trailStatusRouter from './routes/trailStatus.js'
import crowdThresholdsRouter from './routes/crowdThresholds.js'
import alertRulesRouter from './routes/alertRules.js'
import trailAlternativeRouter from './routes/trailAlternative.js'
import reportsRouter from './routes/reports.js'
import myReportsRouter from './routes/myReports.js'
import presenceRouter from './routes/presence.js'
import notificationsRouter from './routes/notifications.js'
import statsRouter from './routes/stats.js'
import { serveReportPhoto } from './middleware/serveReportPhoto.js'
import { createClientRouter } from './middleware/serveClient.js'
import { findProductionEnvProblems } from './config/productionEnv.js'
import { attachRealtime } from './services/realtime.js'
import { startCrowdSweep } from './services/trails/overcrowding.js'
import { registerEmergencyNotifications } from './services/notifications/notifyTrailEmergency.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/push', pushRouter)
app.use('/api/trails', trailsRouter)
app.use('/api/trails', trailStatusRouter)
app.use('/api/trails', crowdThresholdsRouter)
app.use('/api/trails', alertRulesRouter)
app.use('/api/trails', trailAlternativeRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/reports', myReportsRouter)
app.use('/api/presence', presenceRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/stats', statsRouter)
app.get('/api/uploads/reports/:filename', serveReportPhoto)

if (process.env.NODE_ENV === 'production') {
  const clientRouter = createClientRouter()
  if (clientRouter) app.use(clientRouter)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3000

  if (process.env.NODE_ENV === 'production') {
    const problems = findProductionEnvProblems()
    if (problems.length > 0) {
      console.error(`Cannot start in production: ${problems.join('; ')}`)
      process.exit(1)
    }
  }

  registerEmergencyNotifications()

  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => {
      const server = createServer(app)
      attachRealtime(server, { corsOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' })
      server.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`)
        startCrowdSweep()
      })
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err)
      process.exit(1)
    })
}

export default app
