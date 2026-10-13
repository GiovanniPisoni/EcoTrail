import './commands.js'

beforeEach(() => {
  cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', { statusCode: 204 })
  cy.intercept('GET', '**/dev-sw.js*', { statusCode: 404 })
  cy.intercept('GET', '**/service-worker.js*', { statusCode: 404 })

  cy.task('db:seed').as('seed')
})
