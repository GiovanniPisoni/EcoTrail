import { reportEvents, REPORT_UPDATED } from './reportEvents.js'
import { adjustReputation, refreshTrustSafely } from './reportTrust.js'
import { SPAM_REPUTATION_PENALTY } from './reportSpam.js'
import { evaluateTrailAlertSafely } from '../trails/autoTrailAlert.js'

export async function reviewReport(report, { status, note, spam, reviewerId }) {
  const wasValidated = report.validationStatus === 'validated'

  report.validationStatus = status
  report.validationNote = note || undefined
  report.validatedBy = reviewerId
  report.validatedAt = new Date()
  report.isSuspicious = false

  const authorId = report.author?._id
  if (spam === true && !report.markedAsSpam) {
    const applied = authorId
      ? await adjustReputation(authorId, -SPAM_REPUTATION_PENALTY, {
          reason: 'spam',
          report: report._id
        })
      : 0
    report.markedAsSpam = true
    report.spamPenalty = -applied
  } else if (spam !== true && report.markedAsSpam) {
    if (authorId && report.spamPenalty > 0) {
      await adjustReputation(authorId, report.spamPenalty, {
        reason: 'spam_reverted',
        report: report._id
      })
    }
    report.markedAsSpam = false
    report.spamPenalty = 0
  }

  await report.save()

  const reputationChange = Number(status === 'validated') - Number(wasValidated)
  if (reputationChange !== 0 && authorId) {
    await adjustReputation(authorId, reputationChange, {
      reason: reputationChange > 0 ? 'report_validated' : 'validation_revoked',
      report: report._id
    })
  }
  const trustScore = await refreshTrustSafely(report)
  if (trustScore !== null) report.trustScore = trustScore
  if (status === 'validated') await evaluateTrailAlertSafely(report)

  reportEvents.emit(REPORT_UPDATED, {
    reportId: report._id,
    trailId: report.trail?._id,
    validationStatus: report.validationStatus
  })

  return report
}
