function visitMap(seed, options = {}) {
  cy.visitAs('hiker', '/', {
    geolocation: { latitude: seed.trail.latitude, longitude: seed.trail.longitude },
    ...options
  })
}

function sendReport() {
  cy.openReportDialog()
  cy.fillReport({ type: 'Flooding', severity: 'Medium' })
  cy.submitReport()
}

describe('Offline report queue', () => {
  it('keeps the report when the server is unreachable and sends it once when back', function () {
    visitMap(this.seed)
    cy.intercept('POST', '/api/reports', { forceNetworkError: true }).as('failedSend')

    sendReport()
    cy.wait('@failedSend')
    cy.contains('h1', 'Report saved').should('be.visible')
    cy.task('db:reports').should('have.length', 0)
    cy.contains('button', 'Back to map').click()

    cy.intercept('POST', '/api/reports', (req) => req.continue()).as('send')
    cy.window().then((win) => win.dispatchEvent(new Event('online')))

    cy.wait('@send').its('response.statusCode').should('eq', 201)
    cy.task('db:reports').then((reports) => {
      expect(reports).to.have.length(1)
      expect(reports[0]).to.include({ type: 'flooding', validationStatus: 'pending' })
    })
  })

  it('queues the report while the browser is offline and flushes it on reconnection', function () {
    visitMap(this.seed, {
      onBeforeLoad(win) {
        win.__offline = true
        Object.defineProperty(win.navigator, 'onLine', { get: () => !win.__offline })
      }
    })
    cy.intercept('POST', '/api/reports').as('send')

    sendReport()
    cy.contains('h1', 'Report saved').should('be.visible')
    cy.contains('button', 'Back to map').click()
    cy.contains('[role="status"]', '1 report will be sent').should('be.visible')
    cy.get('@send.all').should('have.length', 0)
    cy.task('db:reports').should('have.length', 0)

    cy.window().then((win) => {
      win.__offline = false
      win.dispatchEvent(new Event('online'))
    })

    cy.wait('@send').its('response.statusCode').should('eq', 201)
    cy.contains('[role="status"]', 'will be sent').should('not.exist')
    cy.task('db:reports').should('have.length', 1)
  })

  it('does not duplicate the report if it is flushed twice', function () {
    visitMap(this.seed)
    cy.intercept('POST', '/api/reports', { forceNetworkError: true }).as('failedSend')

    sendReport()
    cy.wait('@failedSend')
    cy.contains('button', 'Back to map').click()

    cy.intercept('POST', '/api/reports', (req) => req.continue()).as('send')
    cy.window().then((win) => {
      win.dispatchEvent(new Event('online'))
      win.dispatchEvent(new Event('online'))
    })

    cy.wait('@send')
    cy.task('db:reports').should('have.length', 1)
  })
})
