const SEARCH = 'https://nominatim.openstreetmap.org/search*'

const andalo = {
  place_id: 1,
  display_name:
    'Andalo, Comunità della Paganella, Provincia di Trento, Trentino-Alto Adige, Italia',
  lat: '46.1637',
  lon: '10.9033',
  boundingbox: ['46.1437', '46.1837', '10.8733', '10.9333']
}

describe('Map of the report form', () => {
  beforeEach(() => {
    cy.intercept('GET', SEARCH, [andalo])
  })

  it('has a search bar to move the map to a place', () => {
    cy.visitAs('hiker', '/')
    cy.openReportDialog()

    cy.get('.location-picker-wrap .map-search').should('be.visible')
    cy.get('.location-picker-wrap .map-search__input').type('Andalo{enter}')

    cy.get('.location-picker-wrap .map-search__input').should('contain.value', 'Andalo')
  })

  it('shows the trails, so the person can tap one to set the position', () => {
    cy.visitAs('hiker', '/')
    cy.openReportDialog()
    cy.get('.location-picker-wrap .map-search__input').type('Andalo{enter}')

    cy.get('.location-picker .leaflet-overlay-pane path').should('have.length.greaterThan', 0)
  })

  describe('on a phone', () => {
    beforeEach(() => {
      cy.viewport(360, 660)
    })

    it('is tall enough to see the trails and keeps the search inside the screen', () => {
      cy.visitAs('hiker', '/')
      cy.openReportDialog()

      cy.get('.location-picker').then(($map) => {
        expect($map[0].getBoundingClientRect().height).to.be.at.least(240)
      })
      cy.get('.location-picker-wrap .map-search').then(($search) => {
        const box = $search[0].getBoundingClientRect()
        expect(box.left).to.be.at.least(0)
        expect(box.right).to.be.at.most(360)
      })
    })
  })
})
