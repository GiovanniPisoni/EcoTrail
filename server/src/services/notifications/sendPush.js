import webpush from 'web-push'
import Notification from '../../models/Notification.js'
import { isMuted } from '../../config/notificationPreferences.js'

let configured = false

function ensureConfigured() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )
    configured = true
  }
}

function hostOf(endpoint) {
  try {
    return new URL(endpoint).host
  } catch {
    return 'unknown'
  }
}

function isGone(err) {
  return err.statusCode === 404 || err.statusCode === 410
}

// Sends to every device of the user. A device that fails must not stop the others: the result of
// each one is returned (and logged), and an error is thrown only when nothing was delivered.
export async function sendPush(user, payload, { type, trail } = {}) {
  if (type) {
    await Notification.create({
      user: user._id,
      type,
      trail,
      title: payload.title,
      body: payload.body,
      url: payload.url
    })
  }

  if (type && isMuted(user.notificationPreferences)) return []
  if (user.pushSubscriptions.length === 0) return []

  ensureConfigured()

  const message = JSON.stringify(payload)
  const stillValid = []
  const results = []
  let lastError = null

  for (const subscription of user.pushSubscriptions) {
    const host = hostOf(subscription.endpoint)

    try {
      await webpush.sendNotification(subscription, message)
      stillValid.push(subscription)
      results.push({ host, ok: true })
    } catch (err) {
      const result = { host, ok: false, statusCode: err.statusCode ?? null }
      if (err.body) result.detail = String(err.body).slice(0, 300)
      results.push(result)

      if (isGone(err)) continue

      stillValid.push(subscription)
      lastError = err
      console.error(
        `[push] could not send to ${host}: status ${result.statusCode ?? 'none'} ${err.message}`
      )
    }
  }

  if (stillValid.length !== user.pushSubscriptions.length) {
    user.pushSubscriptions = stillValid
    await user.save()
  }

  if (lastError && !results.some((result) => result.ok)) {
    lastError.results = results
    throw lastError
  }

  return results
}
