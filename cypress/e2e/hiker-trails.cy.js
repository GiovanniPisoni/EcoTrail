import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

function selectTrail() {
  cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME).click()
}

describe('Hiker trail list', () => {
  it('shows the details of a selected trail and hides them again', () => {
    cy.visitAs('hiker', '/')
    selectTrail()

    cy.get('.trails-sidebar__details')
      .should('contain', 'Distance')
      .and('contain', 'Duration')
      .and('contain', 'Difficulty')
    cy.get('.trail-alternative').should('not.exist')

    selectTrail()
    cy.get('.trails-sidebar__details').should('not.exist')
  })

  it('hides and shows the sidebar', () => {
    cy.visitAs('hiker', '/')
    cy.get('.trails-sidebar').should('be.visible')

    cy.get('button[title="Hide nearby trails"]').click()
    cy.get('.trails-sidebar').should('not.exist')

    cy.get('button[title="Show nearby trails"]').click()
    cy.get('.trails-sidebar').should('be.visible')
  })

  it('suggests the closest free trail as an alternative to a closed one', () => {
    cy.intercept('GET', '/api/trails/*/alternative').as('alternative')
    cy.task('db:updateTrail', { set: { status: 'closed' } })
    cy.visitAs('hiker', '/')
    selectTrail()

    cy.wait('@alternative').its('response.statusCode').should('eq', 200)
    cy.get('.trail-alternative')
      .should('contain', 'Suggested alternative')
      .and('contain', 'Closest free trail')
    cy.get('.trail-alternative__name')
      .invoke('text')
      .then((alternativeName) => {
        cy.contains('.trail-alternative button', 'Show on map').click()
        cy.get('.trails-sidebar__item--selected').should('contain', alternativeName.trim())
      })
  })
})
