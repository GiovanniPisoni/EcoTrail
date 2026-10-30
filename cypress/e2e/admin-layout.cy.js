const PAGE_BACKGROUND = 'rgb(233, 238, 233)'

describe('Page background', () => {
  it('sets the admin cards apart from the page background', () => {
    cy.visitAs('admin', '/admin')

    cy.get('body').should('have.css', 'background-color', PAGE_BACKGROUND)
    cy.get('.admin-page__stat-card')
      .first()
      .should('have.css', 'background-color', 'rgb(255, 255, 255)')
      .and('have.css', 'border-top-width', '1px')
  })

  it('uses the same background on the hiker pages', () => {
    cy.visitAs('hiker', '/profile')

    cy.get('body').should('have.css', 'background-color', PAGE_BACKGROUND)
    cy.get('.base-card').first().should('have.css', 'border-top-width', '1px')
  })
})
