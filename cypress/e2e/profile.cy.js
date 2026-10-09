describe('Hiker profile', () => {
  it('shows the account details', () => {
    cy.task('db:setReputation', 3)
    cy.visitAs('hiker', '/profile')

    cy.contains('h1', 'My profile').should('be.visible')
    cy.get('.profile-page__account').should('contain', 'hiker@ecotrail.test')
    cy.get('.profile-page__account').should('contain', 'hiker')
    cy.contains('.profile-page__account div', 'Reputation').should('contain', '3')
  })

  it('shows an empty state without reports', () => {
    cy.visitAs('hiker', '/profile')
    cy.contains("You haven't submitted any report yet.").should('be.visible')
  })

  it('lists the reports with their status and the rejection reason', () => {
    cy.task('db:insertReports', [
      { type: 'fallen_tree', validationStatus: 'pending' },
      { type: 'overcrowding', validationStatus: 'rejected', validationNote: 'Duplicate report' },
      { type: 'landslide', validationStatus: 'validated' }
    ])
    cy.visitAs('hiker', '/profile')

    cy.get('.profile-page__item').should('have.length', 3)
    cy.contains('.profile-page__item', 'Fallen tree').should('contain', 'Pending')
    cy.contains('.profile-page__item', 'Landslide').should('contain', 'Validated')
    cy.contains('.profile-page__item', 'Overcrowding')
      .should('contain', 'Rejected')
      .and('contain', 'Reason: Duplicate report')
  })

  it('withdraws a pending report', () => {
    cy.intercept('PATCH', '/api/reports/*/withdraw').as('withdraw')
    cy.task('db:insertReports', [{ type: 'fallen_tree', validationStatus: 'pending' }])
    cy.visitAs('hiker', '/profile')

    cy.contains('.profile-page__item', 'Fallen tree').contains('button', 'Withdraw').click()

    cy.wait('@withdraw').its('response.statusCode').should('eq', 200)
    cy.contains('.profile-page__item', 'Fallen tree').should('contain', 'Withdrawn')
    cy.contains('.profile-page__item', 'Fallen tree')
      .contains('button', 'Withdraw')
      .should('not.exist')
    cy.task('db:reports').then((reports) => {
      expect(reports[0].validationStatus).to.eq('withdrawn')
    })
  })

  it('shows a report waiting in the offline queue and lets the hiker discard it', function () {
    cy.visitAs('hiker', '/', {
      geolocation: { latitude: this.seed.trail.latitude, longitude: this.seed.trail.longitude }
    })
    cy.intercept('POST', '/api/reports', { forceNetworkError: true }).as('failedSend')

    cy.openReportDialog()
    cy.fillReport({ type: 'Flooding', severity: 'Medium' })
    cy.submitReport()
    cy.wait('@failedSend')
    cy.contains('button', 'Back to map').click()

    cy.contains('a', 'My profile').click()
    cy.get('.profile-page__item--queued')
      .should('contain', 'Flooding')
      .and('contain', 'Waiting to be sent')

    cy.contains('.profile-page__item--queued button', 'Discard').click()
    cy.get('.profile-page__item--queued').should('not.exist')
  })
})
