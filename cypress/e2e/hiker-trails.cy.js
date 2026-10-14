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

  it('centers the map on the trail selected in the list', () => {
    cy.visitAs('hiker', '/')
    selectTrail()

    cy.get('.leaflet-container').then(($map) => {
      cy.get('path.leaflet-interactive[stroke-width="7"]').should(($path) => {
        const mapBox = $map[0].getBoundingClientRect()
        const pathBox = $path[0].getBoundingClientRect()
        const offsetX = pathBox.left + pathBox.width / 2 - (mapBox.left + mapBox.width / 2)
        const offsetY = pathBox.top + pathBox.height / 2 - (mapBox.top + mapBox.height / 2)

        expect(Math.abs(offsetX)).to.be.lessThan(40)
        expect(Math.abs(offsetY)).to.be.lessThan(40)
      })
    })
  })

  it('brings the list to the trail picked on the map', () => {
    cy.visitAs('hiker', '/')
    cy.get('.trails-sidebar__item').should('have.length.greaterThan', 5)

    cy.get('path.leaflet-interactive').last().trigger('click', { force: true })

    cy.get('.trails-sidebar__item--selected').should(($item) => {
      const sidebarBox = Cypress.$('.trails-sidebar')[0].getBoundingClientRect()
      const itemBox = $item[0].getBoundingClientRect()

      expect(itemBox.top).to.be.at.least(sidebarBox.top - 1)
      expect(itemBox.top).to.be.lessThan(sidebarBox.bottom)
    })
  })

  it('makes the trails easy to tap with a wide invisible area around each line', () => {
    cy.visitAs('hiker', '/')
    cy.get('.trails-sidebar__item').should('have.length.greaterThan', 5)

    cy.get('path.leaflet-interactive[stroke-opacity="0"]')
      .should('have.length.greaterThan', 0)
      .first()
      .should('have.attr', 'stroke-width')
      .and('match', /^(16|28)$/)
  })

  it('opens the sidebar when a trail is picked on the map while it is hidden', () => {
    cy.visitAs('hiker', '/')
    cy.get('button[title="Hide nearby trails"]').click()

    cy.get('path.leaflet-interactive').first().trigger('click', { force: true })

    cy.get('.trails-sidebar').should('be.visible')
    cy.get('.trails-sidebar__item--selected').should('exist')
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
