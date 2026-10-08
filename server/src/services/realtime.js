import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { trailEvents, TRAIL_STATUS_CHANGED } from './trails/trailEvents.js'
import { reportEvents, REPORT_CREATED, REPORT_UPDATED } from './reports/reportEvents.js'

export const ADMIN_ROOM = 'admins'

export function attachRealtime(httpServer, { corsOrigin = 'http://localhost:5173' } = {}) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin } })

  io.use((socket, next) => {
    try {
      socket.data.user = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET)
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    if (socket.data.user.role === 'admin') {
      socket.join(ADMIN_ROOM)
    }
  })

  const onTrailStatusChanged = (event) => {
    io.emit('trail:status-changed', {
      trailId: String(event.trailId),
      previousStatus: event.previousStatus,
      status: event.newStatus
    })
  }

  const onReportCreated = (event) => {
    io.to(ADMIN_ROOM).emit('report:created', {
      reportId: String(event.reportId),
      trailId: String(event.trailId),
      type: event.type,
      severity: event.severity
    })
  }

  const onReportUpdated = (event) => {
    io.emit('report:updated', {
      reportId: String(event.reportId),
      trailId: event.trailId ? String(event.trailId) : null,
      validationStatus: event.validationStatus
    })
  }

  trailEvents.on(TRAIL_STATUS_CHANGED, onTrailStatusChanged)
  reportEvents.on(REPORT_CREATED, onReportCreated)
  reportEvents.on(REPORT_UPDATED, onReportUpdated)

  async function close() {
    trailEvents.off(TRAIL_STATUS_CHANGED, onTrailStatusChanged)
    reportEvents.off(REPORT_CREATED, onReportCreated)
    reportEvents.off(REPORT_UPDATED, onReportUpdated)
    await io.close()
  }

  return { io, close }
}
