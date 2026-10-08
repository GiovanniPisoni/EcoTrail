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

  it('keeps the submit button disabled until type, severity and position are set', function () {
    visitMap(this.seed, 'denied')
    cy.openReportDialog()
    cy.contains("We couldn't get your location").should('be.visible')

    cy.contains('button', 'Submit incident report').should('be.disabled')
    cy.fillReport({ type: 'Landslide', severity: 'Low' })
    cy.contains('button', 'Submit incident report').should('be.disabled')
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
