import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

describe('Admin trails that need attention', () => {
  it('shows nothing when no trail is at risk or has a closure proposal', () => {
    cy.visitAs('admin', '/admin/trails')

    cy.get('.admin-trails-sidebar__item').should('exist')
    cy.contains('Needs attention').should('not.exist')
  })

  it('lists an at risk trail and opens it when clicked', () => {
    cy.task('db:updateTrail', { set: { status: 'at_risk' } })
    cy.visitAs('admin', '/admin/trails')

    cy.contains('.admin-trails-sidebar__attention', 'Needs attention (1)').should('be.visible')
    cy.contains('.admin-trails-sidebar__attention .admin-trails-sidebar__item', E2E_TRAIL_NAME)
      .should('be.visible')
      .click()

    cy.get('.admin-trail-panel__name').should('contain', E2E_TRAIL_NAME)
  })

  it('flags the trail with a closure proposal', () => {
    cy.task('db:updateTrail', { set: { status: 'at_risk' } })
    cy.task('db:proposeClosure', { reason: 'Many serious reports', reportCount: 5 })
    cy.visitAs('admin', '/admin/trails')

    cy.contains('.admin-trails-sidebar__attention', 'Closure proposed').should('be.visible')
  })

  it('removes the trail from the section once it is closed', () => {
    cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')
    cy.task('db:updateTrail', { set: { status: 'at_risk' } })
    cy.visitAs('admin', '/admin/trails')

    cy.contains(
      '.admin-trails-sidebar__attention .admin-trails-sidebar__item',
      E2E_TRAIL_NAME
    ).click()
    cy.get('.admin-trail-panel select').select('Closed')
    cy.get('.admin-trail-panel textarea').first().type('Landslide on the path')
    cy.contains('button', 'Change status').click()
    cy.wait('@changeStatus')

    cy.get('[role="alertdialog"]').contains('button', 'OK').click()
    cy.contains('Needs attention').should('not.exist')
  })
})
