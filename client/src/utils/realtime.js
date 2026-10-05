import { io } from 'socket.io-client'

export const RECONNECTED = 'reconnected'

const listeners = new Map()
let socket = null
let connectedToken = null

function dispatch(event, payload) {
  listeners.get(event)?.forEach((handler) => handler(payload))
}

export function onRealtime(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(handler)

  return () => listeners.get(event)?.delete(handler)
}

export function connectRealtime(token) {
  if (socket && connectedToken === token) return

  disconnectRealtime()
  connectedToken = token

  socket = io({ auth: { token } })
  socket.onAny(dispatch)
  socket.io.on('reconnect', () => dispatch(RECONNECTED))
}

export function disconnectRealtime() {
  socket?.disconnect()
  socket = null
  connectedToken = null
}
