import { E2E_USERS } from './e2e-config.js'

const TOKEN_KEY = 'ecotrail_token'
const USER_KEY = 'ecotrail_user'

Cypress.Commands.add('visitAs', (role, path = '/', options = {}) => {
  const { email, password } = E2E_USERS[role]

  cy.request('POST', '/api/auth/login', { email, password }).then(({ body }) => {
    cy.request({ url: '/api/auth/me', headers: { Authorization: `Bearer ${body.token}` } }).then(
      ({ body: me }) => {
        cy.visit(path, {
          onBeforeLoad(win) {
            win.localStorage.setItem(TOKEN_KEY, body.token)
            win.localStorage.setItem(USER_KEY, JSON.stringify({ ...me, email }))
            if (!options.showAdminIntro) {
              win.localStorage.setItem('ecotrail:admin-intro-dismissed', '1')
            }

            const { geolocation, locationPermission } = options

            if (locationPermission) {
              const original = win.navigator.permissions.query.bind(win.navigator.permissions)
              cy.stub(win.navigator.permissions, 'query').callsFake((descriptor) =>
                descriptor.name === 'geolocation'
                  ? Promise.resolve({ state: locationPermission })
                  : original(descriptor)
              )
            }

            if (geolocation) {
              cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake(
                (success, fail) => {
                  if (geolocation === 'denied') return fail({ code: 1, message: 'denied' })
                  return success({
                    coords: {
                      latitude: geolocation.latitude,
                      longitude: geolocation.longitude,
                      accuracy: 10
                    }
                  })
                }
              )
            }

            options.onBeforeLoad?.(win)
          }
        })
      }
    )
  })
})

Cypress.Commands.add('openReportDialog', () => {
  cy.get('button[title="New report"]').click()
  cy.contains('h1', 'New trail incident report').should('be.visible')
})

Cypress.Commands.add('fillReport', ({ type, severity }) => {
  cy.contains('.send-report__type-option', type).click()
  cy.contains('.send-report__severity-option', severity).click()
})

Cypress.Commands.add('submitReport', () => {
  cy.contains('button', 'Submit incident report').should('not.be.disabled').click()
})
