import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

const CLOSED_PATH = 'path.leaflet-interactive[stroke="#EF4444"]'

function trailInList() {
  return cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME)
}

describe('Legend of the map', () => {
  beforeEach(() => {
    cy.task('db:updateTrail', { set: { status: 'closed' } })
  })

  it('has a tick for each status, all ticked at the start', () => {
    cy.visitAs('hiker', '/')

    cy.get('.trail-legend-checkbox').should('have.length', 4).and('be.checked')
    cy.get('.trail-legend').should('contain', 'Open').and('contain', 'Closed')
  })

  it('hides the trails of an unticked status, in the list and on the map, and shows them again', () => {
    cy.visitAs('hiker', '/')
    trailInList().should('exist')
    cy.get(CLOSED_PATH).should('exist')

    cy.get('.trail-legend-checkbox[data-status="closed"]').uncheck()

    trailInList().should('not.exist')
    cy.get(CLOSED_PATH).should('not.exist')

    cy.get('.trail-legend-checkbox[data-status="closed"]').check()

    trailInList().should('exist')
    cy.get(CLOSED_PATH).should('exist')
  })

  it('says so when no trail matches the ticked statuses', () => {
    cy.visitAs('hiker', '/')
    trailInList().should('exist')

    cy.get('.trail-legend-checkbox').uncheck({ multiple: true })

    cy.get('.trails-sidebar__item').should('not.exist')
    cy.contains('.trails-sidebar__empty', 'No trails match the statuses ticked in the legend')
  })

  it('does not hide a trail whose status is still ticked', () => {
    cy.visitAs('hiker', '/')
    cy.get('.trail-legend-checkbox[data-status="closed"]').uncheck()
    trailInList().should('not.exist')

    cy.task('db:updateTrail', { set: { status: 'free' } })
    cy.reload()
    cy.get('.trail-legend-checkbox[data-status="closed"]').uncheck()

    trailInList().should('exist')
  })
})
