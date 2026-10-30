function openReport(label) {
  return cy.contains('.admin-reports-sidebar__item', label).click()
}

function inReport(label) {
  return cy.contains('.admin-reports-sidebar__item', label)
}

describe('Admin moderates reports', () => {
  beforeEach(() => {
    cy.intercept('PATCH', '/api/reports/*/validate').as('review')
    cy.task('db:insertReports', [
      { type: 'fallen_tree', severity: 'medium' },
      { type: 'overcrowding', severity: 'high' }
    ])
    cy.visitAs('admin', '/admin')
  })

  it('lists the pending reports in the review queue', () => {
    cy.contains('.admin-reports-sidebar__tab', 'Review queue (2)').should('be.visible')
    cy.contains('.admin-reports-sidebar__item', 'Fallen tree').should('be.visible')
    cy.contains('.admin-reports-sidebar__item', 'Overcrowding').should('be.visible')
  })

  it('points a report to the closure proposal of its trail', () => {
    cy.task('db:proposeClosure', {
      reason: 'Three reliable high-severity reports in 24 hours',
      reportCount: 3
    })
    cy.reload()

    inReport('Fallen tree').should('contain', 'Closure proposed')
    openReport('Fallen tree')
    inReport('Fallen tree').contains('a', 'Review the closure proposal').click()

    cy.location('pathname').should('eq', '/admin/trails')
    cy.contains('.admin-trail-panel__proposal', 'Closure proposed').should('be.visible')
  })

  it('validates a report and moves it to the verified logs', () => {
    openReport('Fallen tree')
    inReport('Fallen tree').contains('button', 'Validate').click()

    cy.wait('@review').its('response.statusCode').should('eq', 200)
    cy.contains('.admin-reports-sidebar__item', 'Fallen tree').should('not.exist')

    cy.contains('.admin-reports-sidebar__tab', 'Verified logs').click()
    cy.contains('.admin-reports-sidebar__item', 'Fallen tree').should('be.visible')

    cy.task('db:reports').then((reports) => {
      const report = reports.find((item) => item.type === 'fallen_tree')
      expect(report.validationStatus).to.eq('validated')
    })
  })

  it('rejects a report with a note', () => {
    openReport('Overcrowding')
    inReport('Overcrowding').find('textarea').type('Not on the trail')
    inReport('Overcrowding').contains('button', 'Reject').click()

    cy.wait('@review').its('response.statusCode').should('eq', 200)
    cy.contains('.admin-reports-sidebar__item', 'Overcrowding').should('not.exist')

    cy.contains('.admin-reports-sidebar__tab', 'Rejected').click()
    openReport('Overcrowding')
    cy.contains('Note: Not on the trail').should('be.visible')

    cy.task('db:reports').then((reports) => {
      const report = reports.find((item) => item.type === 'overcrowding')
      expect(report).to.include({
        validationStatus: 'rejected',
        validationNote: 'Not on the trail'
      })
    })
  })

  it('filters the queue by severity', () => {
    cy.contains('.admin-reports-sidebar__severity-option', 'High').click()
    cy.contains('.admin-reports-sidebar__item', 'Overcrowding').should('be.visible')
    cy.contains('.admin-reports-sidebar__item', 'Fallen tree').should('not.exist')
  })

  it('shows a legend and a confirmation message after a review', () => {
    openReport('Fallen tree')
    inReport('Fallen tree').should('contain', 'hides it, with no penalty')
    inReport('Fallen tree').contains('button', 'Validate').click()

    cy.wait('@review')
    cy.get('[role="status"]').should('contain', 'Report validated')
  })

  it('lets the authority change a rejected report to validated', () => {
    openReport('Overcrowding')
    inReport('Overcrowding').contains('button', 'Reject').click()
    cy.wait('@review')

    cy.contains('.admin-reports-sidebar__tab', 'Rejected').click()
    openReport('Overcrowding')
    inReport('Overcrowding').contains('button', 'Change to validated').click()

    cy.wait('@review').its('response.statusCode').should('eq', 200)
    cy.task('db:reports').then((reports) => {
      const report = reports.find((item) => item.type === 'overcrowding')
      expect(report.validationStatus).to.eq('validated')
    })
  })
})
