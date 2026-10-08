import Report from '../../models/Report.js'
import User from '../../models/User.js'
import ReputationChange from '../../models/ReputationChange.js'

export const BASE_TRUST_SCORE = 1
export const CONFIRMATION_RADIUS_METERS = 300
export const CONFIRMATION_WINDOW_MS = 2 * 60 * 60 * 1000
export const REPUTABLE_MIN_REPUTATION = 3
export const REPUTABLE_BONUS = 1

const COUNTING_STATUSES = ['pending', 'validated']
const EARTH_RADIUS_METERS = 6378100

function idOf(value) {
  return value?._id ?? value
}

export function reputationBonus(reputation) {
  return (reputation ?? 0) >= REPUTABLE_MIN_REPUTATION ? REPUTABLE_BONUS : 0
}

function sameSpotAndTime(report) {
  const [longitude, latitude] = report.location.coordinates
  const createdAt = new Date(report.createdAt).getTime()

  return {
    _id: { $ne: report._id },
    type: report.type,
    author: { $ne: idOf(report.author) },
    createdAt: {
      $gte: new Date(createdAt - CONFIRMATION_WINDOW_MS),
      $lte: new Date(createdAt + CONFIRMATION_WINDOW_MS)
    },
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], CONFIRMATION_RADIUS_METERS / EARTH_RADIUS_METERS]
      }
    }
  }
}

export async function computeTrustScore(report) {
  const [author, confirmations] = await Promise.all([
    User.findById(idOf(report.author)).select('reputation').lean(),
    Report.find({
      ...sameSpotAndTime(report),
      validationStatus: { $in: COUNTING_STATUSES },
      isSuspicious: { $ne: true }
    })
      .select('author')
      .populate('author', 'reputation')
      .lean()
  ])

  const weightByAuthor = new Map()
  for (const confirmation of confirmations) {
    const confirmer = confirmation.author
    if (!confirmer) continue
    weightByAuthor.set(String(confirmer._id), 1 + reputationBonus(confirmer.reputation))
  }

  const confirmationsScore = [...weightByAuthor.values()].reduce((sum, weight) => sum + weight, 0)
  return BASE_TRUST_SCORE + reputationBonus(author?.reputation) + confirmationsScore
}

async function saveTrustScore(report) {
  const trustScore = await computeTrustScore(report)
  await Report.updateOne({ _id: report._id }, { trustScore }, { timestamps: false })
  return trustScore
}

export async function refreshTrustAround(report) {
  const neighbors = await Report.find(sameSpotAndTime(report)).lean()

  const trustScore = await saveTrustScore(report)
  await Promise.all(neighbors.map(saveTrustScore))

  return trustScore
}

export async function refreshTrustSafely(report) {
  try {
    return await refreshTrustAround(report)
  } catch (err) {
    console.error('[report-trust] could not refresh the trust score:', err.message)
    return null
  }
}

export async function adjustReputation(userId, delta, { reason, report } = {}) {
  let applied = 0

  if (delta > 0) {
    await User.updateOne({ _id: userId }, { $inc: { reputation: delta } })
    applied = delta
  } else if (delta < 0) {
    const user = await User.findById(userId).select('reputation').lean()
    const decrease = Math.min(Math.max(user?.reputation ?? 0, 0), -delta)
    if (decrease > 0) {
      const result = await User.updateOne(
        { _id: userId, reputation: { $gte: decrease } },
        { $inc: { reputation: -decrease } }
      )
      if (result.modifiedCount === 1) applied = -decrease
    }
  }

  if (reason && applied !== 0) {
    await ReputationChange.create({ user: userId, delta: applied, reason, report })
  }
  return applied
}
