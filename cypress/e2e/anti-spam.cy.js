function sendReport(type, severity) {
  cy.openReportDialog()
  cy.fillReport({ type, severity })
  cy.submitReport()
}

describe('Anti-spam', () => {
  beforeEach(function () {
    cy.intercept('POST', '/api/reports').as('createReport')
    cy.visitAs('hiker', '/', {
      geolocation: { latitude: this.seed.trail.latitude, longitude: this.seed.trail.longitude }
    })
  })

  it('flags an identical report sent right after the first one', () => {
    sendReport('Fallen tree', 'Medium')
    cy.wait('@createReport').its('response.statusCode').should('eq', 201)
    cy.contains('button', 'Back to map').click()

    sendReport('Fallen tree', 'Medium')
    cy.wait('@createReport').its('response.statusCode').should('eq', 201)

    cy.task('db:reports').then((reports) => {
      expect(reports).to.have.length(2)
      expect(reports.map((report) => report.isSuspicious)).to.deep.eq([false, true])
    })
  })

  it('shows the flagged report in the admin Suspicious tab and lets the admin mark it as spam', () => {
    cy.task('db:insertReports', [
      { type: 'landslide', severity: 'low', isSuspicious: true },
      { type: 'flooding', severity: 'low' }
    ])
    cy.task('db:setReputation', 5)
    cy.intercept('PATCH', '/api/reports/*/validate').as('review')

    cy.visitAs('admin', '/admin')
    cy.contains('.admin-reports-sidebar__tab', 'Suspicious (1)').click()
    cy.contains('.admin-reports-sidebar__item', 'Landslide').click()
    cy.contains('.admin-reports-sidebar__item', 'Landslide')
      .contains('button', 'Reject as spam')
      .click()
    cy.contains('button', 'Confirm spam').click()

    cy.wait('@review').its('response.statusCode').should('eq', 200)

    cy.task('db:reports').then((reports) => {
      const spam = reports.find((report) => report.type === 'landslide')
      expect(spam).to.include({ validationStatus: 'rejected', markedAsSpam: true })
    })
    cy.task('db:reputation').should('be.lessThan', 5)
  })

  it('blocks the eleventh report within ten minutes', () => {
    cy.task(
      'db:insertReports',
      Array.from({ length: 10 }, (_, index) => ({ type: 'other', minutesAgo: 1 + index * 0.5 }))
    )

    sendReport('Fallen tree', 'High')

    cy.wait('@createReport').its('response.statusCode').should('eq', 429)
    cy.get('.send-report__error').should('contain', 'Too many reports')
    cy.task('db:reports').should('have.length', 10)
  })
})
