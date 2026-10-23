describe('Admin intro', () => {
  it('explains the sections on the first visit and can be dismissed for good', () => {
    cy.visitAs('admin', '/admin', { showAdminIntro: true })

    cy.contains('Welcome to the board').should('be.visible')
    cy.contains('.admin-layout__intro', 'Trails:').should('be.visible')

    cy.contains('button', 'Got it').click()
    cy.contains('Welcome to the board').should('not.exist')

    cy.reload()
    cy.get('.admin-layout').should('be.visible')
    cy.contains('Welcome to the board').should('not.exist')
  })

  it('can be reopened from the Help button', () => {
    cy.visitAs('admin', '/admin')

    cy.contains('Welcome to the board').should('not.exist')
    cy.contains('button', 'Help').click()
    cy.contains('Welcome to the board').should('be.visible')
  })
})
