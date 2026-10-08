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

  if (type && isMuted(user.notificationPreferences)) return
  if (user.pushSubscriptions.length === 0) return

  ensureConfigured()

  const message = JSON.stringify(payload)
  const stillValid = []

  for (const subscription of user.pushSubscriptions) {
    try {
      await webpush.sendNotification(subscription, message)
      stillValid.push(subscription)
    } catch (err) {
      if (err.statusCode !== 404 && err.statusCode !== 410) {
        throw err
      }
    }
  }

  if (stillValid.length !== user.pushSubscriptions.length) {
    user.pushSubscriptions = stillValid
    await user.save()
  }
}
