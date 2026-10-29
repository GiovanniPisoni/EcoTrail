describe('Admin layout', () => {
  it('sets the cards apart from the page background', () => {
    cy.visitAs('admin', '/admin')

    cy.get('.admin-layout').should('have.css', 'background-color', 'rgb(233, 238, 233)')
    cy.get('.admin-page__stat-card')
      .first()
      .should('have.css', 'background-color', 'rgb(255, 255, 255)')
      .and('have.css', 'border-top-width', '1px')
  })

  it('does not change the look of the hiker pages', () => {
    cy.visitAs('hiker', '/')

    cy.get('.admin-layout').should('not.exist')
  })
})
