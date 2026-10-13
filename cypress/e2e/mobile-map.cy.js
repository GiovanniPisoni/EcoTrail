import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

const PHONE = { width: 360, height: 660 }

function rectOf(selector) {
  return cy.get(selector).then(($element) => $element[0].getBoundingClientRect())
}

describe('Map page on a phone', () => {
  beforeEach(() => {
    cy.viewport(PHONE.width, PHONE.height)
  })

  it('fits the screen, so a finger on the map only moves the map', () => {
    cy.visitAs('hiker', '/')

    cy.get('.map-page__map-wrap').should('be.visible')
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollHeight).to.be.at.most(PHONE.height)
      expect(doc.documentElement.scrollWidth).to.be.at.most(PHONE.width)
    })
  })

  it('has a compact top bar with a menu', () => {
    cy.visitAs('hiker', '/')

    rectOf('.layout-header').should((bar) => expect(bar.height).to.be.at.most(56))
    cy.contains('button', 'Log out').should('not.be.visible')

    cy.get('.menu-button').click()
    cy.contains('a', 'My profile').should('be.visible')
    cy.contains('a', 'Notifications').should('be.visible')
    cy.contains('button', 'Log out').should('be.visible')
  })

  it('closes the menu when the person goes to another page', () => {
    cy.visitAs('hiker', '/')

    cy.get('.menu-button').click()
    cy.contains('a', 'My profile').click()

    cy.location('pathname').should('eq', '/profile')
    cy.contains('button', 'Log out').should('not.be.visible')
  })

  it('logs the hiker out from the menu', () => {
    cy.visitAs('hiker', '/')

    cy.get('.menu-button').click()
    cy.contains('button', 'Log out').click()

    cy.location('pathname').should('eq', '/login')
  })

  it('starts with the trails list closed and opens it from the bar at the bottom', () => {
    cy.visitAs('hiker', '/')

    cy.get('.trails-sidebar').should('not.exist')
    cy.get('.map-page__sidebar-toggle').should('be.visible').and('contain', 'Trails')

    cy.get('.map-page__sidebar-toggle').click()

    cy.get('.trails-sidebar').should('be.visible')
    cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME).should('be.visible')
  })

  it('keeps the list close button in view while the list scrolls', () => {
    cy.visitAs('hiker', '/')
    cy.get('.map-page__sidebar-toggle').click()

    cy.get('.trails-sidebar').scrollTo('bottom')

    cy.get('.trails-sidebar__close').should('be.visible')
    cy.get('.trails-sidebar__close').click()
    cy.get('.trails-sidebar').should('not.exist')
  })

  it('keeps the buttons on the map above the trails list', () => {
    cy.visitAs('hiker', '/')
    cy.get('.map-page__sidebar-toggle').click()
    cy.get('.trails-sidebar').should('be.visible')

    rectOf('.trails-sidebar').then((list) => {
      for (const selector of ['.map-page__new-report', '.reports-filters__toggle']) {
        rectOf(selector).should((button) => {
          expect(button.bottom, `${selector} is above the list`).to.be.at.most(list.top)
        })
      }
    })
  })

  it('shows why a trail is not free in the list', () => {
    cy.task('db:updateTrail', { set: { status: 'at_risk' } })
    cy.task('db:insertTrailHistory', [
      { newStatus: 'at_risk', reason: 'Fallen tree after the storm' }
    ])
    cy.visitAs('hiker', '/')
    cy.get('.map-page__sidebar-toggle').click()

    cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME)
      .find('.trails-sidebar__reason')
      .should('contain', 'Why:')
      .and('contain', 'Fallen tree after the storm')
  })
})
