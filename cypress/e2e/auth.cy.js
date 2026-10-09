import { E2E_USERS } from '../support/e2e-config.js'

function fillLogin({ email, password }) {
  cy.get('input[type="email"]').type(email)
  cy.get('input[type="password"]').type(password)
  cy.contains('button', 'Log in').click()
}

describe('Authentication', () => {
  it('sends an anonymous visitor to the login page', () => {
    cy.visit('/')
    cy.location('pathname').should('eq', '/login')
  })

  it('logs a hiker in and lands on the map', () => {
    cy.visit('/login')
    fillLogin(E2E_USERS.hiker)

    cy.location('pathname').should('eq', '/')
    cy.get('button[title="New report"]').should('be.visible')
    cy.window().its('localStorage.ecotrail_token').should('exist')
  })

  it('logs an admin in and lands on the admin area', () => {
    cy.visit('/login')
    fillLogin(E2E_USERS.admin)

    cy.location('pathname').should('eq', '/admin')
    cy.contains('Reports').should('be.visible')
  })

  it('shows an error and stays on the login page with wrong credentials', () => {
    cy.visit('/login')
    fillLogin({ email: E2E_USERS.hiker.email, password: 'wrong-password' })

    cy.get('[role="alert"]').should('contain', 'Invalid credentials')
    cy.location('pathname').should('eq', '/login')
    cy.window().its('localStorage.ecotrail_token').should('not.exist')
  })

  it('keeps a hiker out of the admin area', () => {
    cy.visitAs('hiker', '/admin')
    cy.location('pathname').should('eq', '/')
  })

  it('logs the hiker out', () => {
    cy.visitAs('hiker', '/')
    cy.contains('button:visible', 'Log out').click()

    cy.location('pathname').should('eq', '/login')
    cy.window().its('localStorage.ecotrail_token').should('not.exist')
  })
})
