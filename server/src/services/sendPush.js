import webpush from 'web-push'

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

export async function sendPush(user, payload) {
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
