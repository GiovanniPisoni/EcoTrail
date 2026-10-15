const MARKER = '.leaflet-overlay-pane path[fill="#1976d2"]'
const MESSAGE = '.trails-map__location-message'
const DIALOG = '[role="dialog"]'

function failWith(code) {
  return {
    locationPermission: 'granted',
    onBeforeLoad(win) {
      cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake((success, fail) =>
        fail({ code, message: 'failed' })
      )
    }
  }
}

function positionRequest() {
  return cy.window().then((win) => win.navigator.geolocation.getCurrentPosition)
}

describe('My position button', () => {
  describe('when the location is already allowed', () => {
    it('moves the map to the position of the person and marks it', function () {
      cy.visitAs('hiker', '/', {
        locationPermission: 'granted',
        geolocation: { latitude: this.seed.trail.latitude, longitude: this.seed.trail.longitude }
      })

      cy.contains('button', 'My position').click()

      cy.get(MARKER).should('exist')
      cy.get(MESSAGE).should('not.exist')
      cy.get(DIALOG).should('not.exist')
    })

    it('tells that the location is blocked instead of doing nothing', () => {
      cy.visitAs('hiker', '/', { locationPermission: 'granted', geolocation: 'denied' })

      cy.contains('button', 'My position').click()

      cy.get(MESSAGE).should('be.visible').and('contain', 'blocked')
      cy.get(MARKER).should('not.exist')
    })

    it('tells that the position is not available', () => {
      cy.visitAs('hiker', '/', failWith(2))

      cy.contains('button', 'My position').click()

      cy.get(MESSAGE).should('contain', 'not available')
    })

    it('tells that it took too long', () => {
      cy.visitAs('hiker', '/', failWith(3))

      cy.contains('button', 'My position').click()

      cy.get(MESSAGE).should('contain', 'too long')
    })

    it('shows a message while the position is being found', () => {
      cy.visitAs('hiker', '/', {
        locationPermission: 'granted',
        onBeforeLoad(win) {
          cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake(() => {})
        }
      })

      cy.contains('button', 'My position').click()

      cy.get(MESSAGE).should('contain', 'Finding your position')
    })
  })

  describe('when the location was not decided yet', () => {
    function visit(seed) {
      cy.visitAs('hiker', '/', {
        locationPermission: 'prompt',
        geolocation: { latitude: seed.trail.latitude, longitude: seed.trail.longitude }
      })
    }

    it('asks first, and uses the location only after a yes', function () {
      visit(this.seed)

      cy.contains('button', 'My position').click()

      cy.get(DIALOG).should('contain', 'Use your location?')
      positionRequest().should('not.have.been.called')

      cy.contains(`${DIALOG} button`, 'Yes, use my location').click()

      cy.get(DIALOG).should('not.exist')
      positionRequest().should('have.been.calledOnce')
      cy.get(MARKER).should('exist')
    })

    it('asks again the next time after a no', function () {
      visit(this.seed)
      cy.contains('button', 'My position').click()

      cy.contains(`${DIALOG} button`, 'Not now').click()

      cy.get(DIALOG).should('not.exist')
      positionRequest().should('not.have.been.called')

      cy.contains('button', 'My position').click()

      cy.get(DIALOG).should('contain', 'Use your location?')
      cy.contains(`${DIALOG} button`, 'Yes, use my location').click()
      cy.get(MARKER).should('exist')
    })
  })

  describe('when the location is blocked in the browser', () => {
    it('explains how to allow it and does not ask the browser again', function () {
      cy.visitAs('hiker', '/', {
        locationPermission: 'denied',
        geolocation: { latitude: this.seed.trail.latitude, longitude: this.seed.trail.longitude }
      })

      cy.contains('button', 'My position').click()

      cy.get(DIALOG).should('contain', 'Location is blocked').and('contain', 'Site settings')
      positionRequest().should('not.have.been.called')

      cy.contains(`${DIALOG} button`, 'OK').click()

      cy.get(DIALOG).should('not.exist')
    })
  })

  describe('on a phone', () => {
    beforeEach(() => {
      cy.viewport(360, 660)
    })

    it('shows the message above the list and the report button', () => {
      cy.visitAs('hiker', '/', { locationPermission: 'granted', geolocation: 'denied' })
      cy.get('.map-page__sidebar-toggle').click()
      cy.get('.trails-sidebar__item').should('have.length.greaterThan', 3)

      cy.contains('button', 'My position').click({ force: true })

      cy.get(MESSAGE).should(($message) => {
        const message = $message[0].getBoundingClientRect()
        const report = Cypress.$('.map-page__new-report')[0].getBoundingClientRect()
        const list = Cypress.$('.trails-sidebar')[0].getBoundingClientRect()

        expect(message.bottom).to.be.at.most(report.top)
        expect(message.bottom).to.be.at.most(list.top)
        expect(message.left).to.be.at.least(0)
        expect(message.right).to.be.at.most(360)
      })
    })

    it('keeps the question inside the screen', function () {
      cy.visitAs('hiker', '/', {
        locationPermission: 'prompt',
        geolocation: { latitude: this.seed.trail.latitude, longitude: this.seed.trail.longitude }
      })

      cy.contains('button', 'My position').click({ force: true })

      cy.get(DIALOG).should(($dialog) => {
        const box = $dialog[0].getBoundingClientRect()
        expect(box.left).to.be.at.least(0)
        expect(box.right).to.be.at.most(360)
      })
      cy.contains(`${DIALOG} button`, 'Yes, use my location').should('be.visible')
    })
  })
})
