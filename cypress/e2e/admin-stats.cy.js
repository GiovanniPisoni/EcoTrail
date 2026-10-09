function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

describe('Admin statistics', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/stats/attendance*').as('attendance')
    cy.intercept('GET', '/api/stats/heatmap*').as('heatmap')
    cy.intercept('GET', '/api/stats/events*').as('events')
  })

  describe('without data', () => {
    it('shows the empty states', () => {
      cy.visitAs('admin', '/admin/stats')

      cy.contains('h1', 'Statistics').should('be.visible')
      cy.contains('.stats-page__card', 'Hikers per trail').should(
        'contain',
        'No activity in this period'
      )
      cy.contains('.stats-page__card', 'Event history').should(
        'contain',
        'No events in this period'
      )
    })

    it('is reachable from the admin navigation', () => {
      cy.visitAs('admin', '/admin')
      cy.contains('a:visible', 'Statistics').click()
      cy.location('pathname').should('eq', '/admin/stats')
    })
  })

  describe('with data', () => {
    beforeEach(() => {
      cy.task('db:insertActivity', { hikers: 3, hoursAgo: 2 })
      cy.task('db:insertReports', [
        { type: 'fallen_tree', severity: 'high', validationStatus: 'validated' }
      ])
      cy.task('db:insertTrailHistory', [
        { newStatus: 'closed', reason: 'Landslide on the path', alertedCount: 2 },
        {
          newStatus: 'at_risk',
          reason: 'Automatic: reliable reports',
          automatic: true,
          alertedCount: 1
        }
      ])
      cy.task('db:insertNotifications', [
        { type: 'emergency', title: 'Trail closed', minutesAgo: 5 }
      ])
      cy.visitAs('admin', '/admin/stats')
      cy.wait(['@attendance', '@heatmap', '@events'])
    })

    it('draws the attendance charts', () => {
      cy.get('canvas[aria-label="Distinct hikers per trail"]').should('be.visible')
      cy.get('canvas[aria-label="Hikers by hour of the day"]').should('be.visible')
    })

    it('filters the hourly chart by trail', () => {
      cy.get('select[aria-label="Filter by trail"]').select('Sentiero della Ceda')
      cy.wait('@attendance').its('request.url').should('include', 'trail=')
      cy.get('canvas[aria-label="Hikers by hour of the day"]').should('be.visible')
    })

    it('loads the heatmap points', () => {
      cy.get('.stats-page__heatmap .leaflet-container').should('be.visible')
      cy.get('@heatmap').its('response.body.points').should('have.length.at.least', 1)
    })

    it('counts the events and filters the history by type', () => {
      cy.contains('.events__total', 'Closures')
        .find('.events__total-value')
        .should('have.text', '1')
      cy.contains('.events__total', 'Automatic alerts')
        .find('.events__total-value')
        .should('have.text', '1')
      cy.contains('.events__total', 'Notifications sent')
        .find('.events__total-value')
        .should('have.text', '1')
      cy.get('.events__item').should('have.length', 3)

      cy.contains('.events__total', 'Closures').click()
      cy.contains('.events__total', 'Closures').should('have.attr', 'aria-pressed', 'true')
      cy.get('.events__item').should('have.length', 1).and('contain', 'Sentiero della Ceda')

      cy.contains('.events__total', 'Closures').click()
      cy.get('.events__item').should('have.length', 3)
    })

    it('changes the period with the presets', () => {
      cy.contains('.period-picker__option', '30 days').click()
      cy.wait('@attendance').its('request.url').should('include', 'days=30')
      cy.contains('.period-picker__option', '30 days').should(
        'have.class',
        'period-picker__option--active'
      )
    })

    it('filters by a custom day', () => {
      cy.contains('.period-picker__option', 'Custom dates').click()
      cy.get('.period-picker__custom input[type="date"]').first().type(daysAgo(3))

      cy.wait('@attendance').its('request.url').should('include', 'from=')
      cy.contains('Showing the selected day only').should('be.visible')
      cy.contains('.stats-page__card', 'Hikers per trail').should(
        'contain',
        'No activity in this period'
      )
    })
  })
})
