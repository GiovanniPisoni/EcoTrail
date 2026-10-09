import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

const CLOSED_COLOR = '#EF4444'

describe('Trail closure', () => {
  it('is applied by the admin and shown on the hiker map', () => {
    cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')

    cy.visitAs('admin', '/admin/trails')
    cy.contains('.admin-trails-sidebar__item', E2E_TRAIL_NAME).click()

    cy.get('.admin-trail-panel select').select('Closed')
    cy.get('.admin-trail-panel textarea').first().type('Landslide on the path')
    cy.contains('button', 'Change status').click()

    cy.wait('@changeStatus').its('response.statusCode').should('eq', 200)
    cy.contains('.admin-trail-panel__timeline-change', 'Open → Closed').should('be.visible')
    cy.task('db:trailStatus', E2E_TRAIL_NAME).should('eq', 'closed')

    cy.visitAs('hiker', '/')
    cy.get(`path.leaflet-interactive[stroke="${CLOSED_COLOR}"]`).should('exist')
  })

  it('shows no closed trail on the hiker map before any change', () => {
    cy.visitAs('hiker', '/')
    cy.get('path.leaflet-interactive').should('exist')
    cy.get(`path.leaflet-interactive[stroke="${CLOSED_COLOR}"]`).should('not.exist')
  })

  it('requires a reason to change the status', () => {
    cy.visitAs('admin', '/admin/trails')
    cy.contains('.admin-trails-sidebar__item', E2E_TRAIL_NAME).click()

    cy.get('.admin-trail-panel select').select('Closed')
    cy.contains('button', 'Change status').click()

    cy.contains('A reason is required').should('be.visible')
    cy.task('db:trailStatus', E2E_TRAIL_NAME).should('eq', 'free')
  })
})
