import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

function openTrail() {
  cy.visitAs('admin', '/admin/trails')
  cy.contains('.admin-trails-sidebar__item', E2E_TRAIL_NAME).click()
  cy.get('.admin-trail-panel__name').should('contain', E2E_TRAIL_NAME)
}

function field(label) {
  return cy.contains('.admin-trail-panel__field', label).find('input')
}

describe('Admin trail settings', () => {
  it('changes the status to at risk and records it in the history', () => {
    cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')
    openTrail()

    cy.get('.admin-trail-panel select').select('At risk')
    cy.get('.admin-trail-panel textarea').first().type('Fallen trees on the path')
    cy.contains('button', 'Change status').click()

    cy.wait('@changeStatus').its('response.statusCode').should('eq', 200)
    cy.get('[role="alertdialog"]').should('contain', 'is now at risk')
    cy.get('[role="alertdialog"]').contains('button', 'OK').click()
    cy.get('[role="alertdialog"]').should('not.exist')
    cy.contains('.admin-trail-panel__timeline-change', 'Open → At risk').should('be.visible')
    cy.task('db:trailStatus', E2E_TRAIL_NAME).should('eq', 'at_risk')
  })

  it('warns that hikers are notified only for at risk and closed', () => {
    openTrail()

    cy.contains('Hikers who enabled emergency alerts').should('not.exist')
    cy.get('.admin-trail-panel select').select('Closed')
    cy.contains('Hikers who enabled emergency alerts').should('be.visible')
    cy.get('.admin-trail-panel select').select('Crowded')
    cy.contains('Hikers who enabled emergency alerts').should('not.exist')
  })

  it('requires a status to be chosen', () => {
    openTrail()

    cy.get('.admin-trail-panel textarea').first().type('No status picked')
    cy.contains('button', 'Change status').click()

    cy.contains('Choose a new status').should('be.visible')
  })

  it('saves the crowding thresholds', () => {
    cy.intercept('PATCH', '/api/trails/*/crowd-thresholds').as('saveThresholds')
    openTrail()

    field('Crowded at').type('6')
    field('Back to free at').type('2')
    cy.contains('button', 'Save thresholds').click()

    cy.wait('@saveThresholds').its('response.statusCode').should('eq', 200)
    cy.contains('Thresholds saved').should('be.visible')
    cy.contains('Currently in use: 6 / 2').should('be.visible')
  })

  it('saves the automatic alert rules', () => {
    cy.intercept('PATCH', '/api/trails/*/alert-rules').as('saveRules')
    openTrail()

    field('At risk after').type('4')
    cy.contains('button', 'Save rules').click()

    cy.wait('@saveRules').its('response.statusCode').should('eq', 200)
    cy.contains('Rules saved').should('be.visible')
    field('At risk after').should('have.value', '4')
  })

  describe('closure proposal', () => {
    beforeEach(() => {
      cy.task('db:proposeClosure', {
        reason: 'Three reliable high-severity reports in 24 hours',
        reportCount: 3
      })
      openTrail()
      cy.contains('.admin-trail-panel__proposal', 'Closure proposed').should('be.visible')
    })

    it('can be dismissed', () => {
      cy.intercept('DELETE', '/api/trails/*/closure-proposal').as('dismiss')

      cy.contains('.admin-trail-panel__proposal button', 'Dismiss').click()

      cy.wait('@dismiss').its('response.statusCode').should('eq', 200)
      cy.contains('Closure proposed').should('not.exist')
      cy.task('db:trailStatus', E2E_TRAIL_NAME).should('eq', 'free')
    })

    it('validates the reports behind it when the trail is closed', () => {
      cy.task('db:insertReports', [{ severity: 'high', trustScore: 3 }])
      openTrail()
      cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')

      cy.contains('.admin-trail-panel__proposal button', 'Close trail').click()

      cy.wait('@changeStatus').its('response.body.validatedReports').should('eq', 1)
      cy.contains('Trail closed. 1 report validated.').should('be.visible')
      cy.get('[role="alertdialog"]').should('contain', 'is now closed')
      cy.task('db:reports').then((reports) => {
        expect(reports[0].validationStatus).to.eq('validated')
      })
    })

    it('keeps the reports pending when the admin unchecks the option', () => {
      cy.task('db:insertReports', [{ severity: 'high', trustScore: 3 }])
      openTrail()
      cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')

      cy.contains('.admin-trail-panel__proposal label', 'Also validate').find('input').uncheck()
      cy.contains('.admin-trail-panel__proposal button', 'Close trail').click()

      cy.wait('@changeStatus').its('response.body.validatedReports').should('eq', 0)
      cy.task('db:reports').then((reports) => {
        expect(reports[0].validationStatus).to.eq('pending')
      })
    })

    it('can be confirmed to close the trail', () => {
      cy.intercept('PATCH', '/api/trails/*/status').as('changeStatus')

      cy.contains('.admin-trail-panel__proposal button', 'Close trail').click()

      cy.wait('@changeStatus').its('response.statusCode').should('eq', 200)
      cy.task('db:trailStatus', E2E_TRAIL_NAME).should('eq', 'closed')
    })
  })
})
