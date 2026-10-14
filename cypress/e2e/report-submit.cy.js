describe('Hiker sends a report', () => {
  function visitMap(seed, geolocation) {
    cy.visitAs('hiker', '/', {
      geolocation: geolocation ?? { latitude: seed.trail.latitude, longitude: seed.trail.longitude }
    })
  }

  beforeEach(function () {
    cy.intercept('POST', '/api/reports').as('createReport')
  })

  it('submits a report with the GPS position and a photo', function () {
    visitMap(this.seed)
    cy.openReportDialog()
    cy.fillReport({ type: 'Fallen tree', severity: 'High' })
    cy.get('input[type="file"]').selectFile('cypress/fixtures/photo.png', { force: true })
    cy.get('img[alt="Report photo preview"]').should('be.visible')
    cy.get('details summary').click()
    cy.get('details textarea').type('Big pine across the path')
    cy.submitReport()

    cy.wait('@createReport').its('response.statusCode').should('eq', 201)
    cy.contains('h1', 'Report sent').should('be.visible')

    cy.task('db:reports').then((reports) => {
      expect(reports).to.have.length(1)
      expect(reports[0]).to.include({
        type: 'fallen_tree',
        severity: 'high',
        validationStatus: 'pending',
        hasPhoto: true
      })
    })

    cy.contains('button', 'Back to map').click()
    cy.contains('h1', 'Report sent').should('not.exist')
  })

  it('says what is missing and does not send an incomplete report', function () {
    visitMap(this.seed, 'denied')
    cy.openReportDialog()
    cy.contains("We couldn't get your location").should('be.visible')
    cy.get('.send-report__section--missing').should('not.exist')

    cy.contains('button', 'Submit incident report').click()

    cy.get('.send-report__error')
      .should('contain', 'what you are reporting')
      .and('contain', 'the severity level')
      .and('contain', 'the location on the map')
    cy.get('.send-report__section--missing').should('have.length', 3)

    cy.fillReport({ type: 'Landslide', severity: 'Low' })

    cy.get('.send-report__section--missing').should('have.length', 1)
    cy.get('.send-report__error')
      .should('contain', 'the location on the map')
      .and('not.contain', 'the severity level')
    cy.get('@createReport.all').should('have.length', 0)
  })

  it('marks which questions are required and tells how to set the position', function () {
    visitMap(this.seed, 'denied')
    cy.openReportDialog()

    cy.get('.send-report__required').should('have.length', 3)
    cy.contains('Tap the map where the problem is').should('be.visible')
    cy.contains('Position not set yet').should('be.visible')

    cy.get('.location-picker').click(60, 60)

    cy.contains('Position set.').should('be.visible')
  })

  it('refuses a position that is far from every trail', function () {
    visitMap(this.seed, { latitude: 44.0, longitude: 9.0 })
    cy.openReportDialog()
    cy.fillReport({ type: 'Flooding', severity: 'Medium' })
    cy.submitReport()

    cy.wait('@createReport').its('response.statusCode').should('eq', 422)
    cy.get('.send-report__error').should('contain', 'No trail within')
    cy.task('db:reports').should('have.length', 0)
  })
})
