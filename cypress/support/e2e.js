import './commands.js'

beforeEach(() => {
  // Map tiles come from the internet and are irrelevant for the tests
  cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', { statusCode: 204 })
  // Keep the service worker out of the way so cy.intercept sees every request
  cy.intercept('GET', '**/dev-sw.js*', { statusCode: 404 })
  cy.intercept('GET', '**/service-worker.js*', { statusCode: 404 })

  cy.task('db:seed').as('seed')
})
