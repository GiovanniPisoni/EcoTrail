import { EventEmitter } from 'node:events'

export const TRAIL_STATUS_CHANGED = 'trail:status-changed'

export const trailEvents = new EventEmitter()

trailEvents.on(TRAIL_STATUS_CHANGED, (payload) => {
  console.log(
    `[trail:status-changed] "${payload.trailName}" ${payload.previousStatus} -> ${payload.newStatus}` +
      ` (reason: "${payload.reason}", by user ${payload.changedBy})`,
  )
})
