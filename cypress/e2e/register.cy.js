import { E2E_USERS } from '../support/e2e-config.js'

function fillRegistration({ email, password, confirm = password }) {
  cy.get('input[type="email"]').type(email)
  cy.get('input[autocomplete="new-password"]').eq(0).type(password)
  cy.get('input[autocomplete="new-password"]').eq(1).type(confirm)
  cy.contains('button', 'Register').click()
}

describe('Registration', () => {
  it('creates a hiker account and logs in', () => {
    cy.visit('/register')
    fillRegistration({ email: 'new.hiker@ecotrail.test', password: 'secret123' })

    cy.location('pathname').should('eq', '/')
    cy.get('button[title="New report"]').should('be.visible')
    cy.contains('new.hiker@ecotrail.test').should('be.visible')
  })

  it('refuses mismatching passwords', () => {
    cy.visit('/register')
    fillRegistration({ email: 'new.hiker@ecotrail.test', password: 'secret123', confirm: 'other' })

    cy.get('[role="alert"]').should('contain', 'The two passwords do not match')
    cy.location('pathname').should('eq', '/register')
  })

  it('refuses an email that is already registered', () => {
    cy.visit('/register')
    fillRegistration({ email: E2E_USERS.hiker.email, password: 'secret123' })

    cy.get('[role="alert"]').should('contain', 'Email already registered')
    cy.location('pathname').should('eq', '/register')
  })

  it('links the login and registration pages', () => {
    cy.visit('/login')
    cy.contains('a', 'Sign up').click()
    cy.location('pathname').should('eq', '/register')

    cy.contains('a', 'Log in').click()
    cy.location('pathname').should('eq', '/login')
  })

  it('sends a logged-in user away from the registration page', () => {
    cy.visitAs('hiker', '/register')
    cy.location('pathname').should('eq', '/')
  })
})
