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

  it('keeps the bottom buttons above the trails list', () => {
    cy.visitAs('hiker', '/')
    cy.get('.map-page__sidebar-toggle').click()
    cy.get('.trails-sidebar').should('be.visible')

    rectOf('.trails-sidebar').then((list) => {
      for (const selector of ['.map-page__new-report', '.hike-mode__button']) {
        rectOf(selector).should((button) => {
          expect(button.bottom, `${selector} is above the list`).to.be.at.most(list.top)
        })
      }
    })
  })

  it('places the controls: tools top left, legend top right, walking bottom left, report bottom right', () => {
    cy.visitAs('hiker', '/')
    cy.get('.leaflet-container').should('be.visible')

    cy.get('.leaflet-control-zoom').should('not.be.visible')

    rectOf('.leaflet-top.leaflet-left .locate-button').then((position) => {
      rectOf('.download-area .locate-button').then((offline) => {
        rectOf('.reports-filters__toggle').then((filters) => {
          expect(position.left, 'My position is on the left').to.be.lessThan(PHONE.width / 2)
          expect(offline.top, 'Offline map is under My position').to.be.at.least(position.bottom)
          expect(filters.top, 'Filters is under Offline map').to.be.at.least(offline.bottom)
          expect(filters.left, 'Filters is on the left').to.be.lessThan(PHONE.width / 2)
        })
      })
    })

    rectOf('.trail-legend').should((legend) => {
      expect(legend.left, 'the legend is on the right').to.be.greaterThan(PHONE.width / 2)
      expect(legend.top, 'the legend is at the top').to.be.lessThan(PHONE.height / 3)
    })

    rectOf('.hike-mode__button').should((walking) => {
      expect(walking.left, "I'm walking is on the left").to.be.lessThan(PHONE.width / 2)
      expect(walking.top, "I'm walking is at the bottom").to.be.greaterThan(PHONE.height / 2)
    })

    rectOf('.map-page__new-report').should((report) => {
      expect(report.left, 'New report is on the right').to.be.greaterThan(PHONE.width / 2)
      expect(report.top, 'New report is at the bottom').to.be.greaterThan(PHONE.height / 2)
    })
  })

  it('opens the filters panel under its button', () => {
    cy.visitAs('hiker', '/')

    cy.get('.reports-filters__toggle').click()

    cy.get('.reports-filters__panel').should('be.visible')
    rectOf('.reports-filters__toggle').then((toggle) => {
      rectOf('.reports-filters__panel').should((panel) => {
        expect(panel.top).to.be.at.least(toggle.bottom)
        expect(panel.height).to.be.greaterThan(100)
      })
    })
  })

  it('hides the trails of the statuses unticked in the legend', () => {
    cy.task('db:updateTrail', { set: { status: 'closed' } })
    cy.visitAs('hiker', '/')
    cy.get('.map-page__sidebar-toggle').click()
    cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME).should('exist')

    cy.get('.trail-legend-checkbox[data-status="closed"]').uncheck()

    cy.contains('.trails-sidebar__item', E2E_TRAIL_NAME).should('not.exist')
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
