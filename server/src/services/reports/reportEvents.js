import { EventEmitter } from 'node:events'

export const REPORT_CREATED = 'report:created'
export const REPORT_UPDATED = 'report:updated'

export const reportEvents = new EventEmitter()
