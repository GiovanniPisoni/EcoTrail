import { E2E_TRAIL_NAME } from '../support/e2e-config.js'

const SEARCH = 'https://nominatim.openstreetmap.org/search*'
const MARKER = '.leaflet-overlay-pane path[fill="#1a3e2f"]'

const andalo = {
  place_id: 1,
  display_name:
    'Andalo, Comunità della Paganella, Provincia di Trento, Trentino-Alto Adige, Italia',
  lat: '46.1637',
  lon: '10.9033',
  boundingbox: ['46.1537', '46.1737', '10.8933', '10.9133']
}

const molveno = {
  place_id: 2,
  display_name:
    'Molveno, Comunità della Paganella, Provincia di Trento, Trentino-Alto Adige, Italia',
  lat: '46.1428',
  lon: '10.9582',
  boundingbox: ['46.1328', '46.1528', '10.9482', '10.9682']
}

function search(text) {
  cy.get('.map-search__input').type(`${text}{enter}`)
}

describe('Search of a place on the map', () => {
  it('goes to the place and shows the trails around it', () => {
    cy.intercept('GET', SEARCH, [andalo]).as('search')
    cy.visitAs('hiker', '/')

    search('Andalo')

    cy.wait('@search').its('request.url').should('include', 'q=Andalo')
    cy.get('.map-search__input').should(
      'have.value',
      'Andalo, Comunità della Paganella, Provincia di Trento'
    )
    cy.get(MARKER).should('exist')
    cy.get('.map-search__result').should('not.exist')
  })

  it('lets the person choose when several places match', () => {
    cy.intercept('GET', SEARCH, [andalo, molveno])
    cy.visitAs('hiker', '/')

    search('Paganella')

    cy.get('.map-search__result').should('have.length', 2)
    cy.contains('.map-search__result', 'Molveno').click()

    cy.get('.map-search__input').should('contain.value', 'Molveno')
    cy.get('.map-search__result').should('not.exist')
    cy.get(MARKER).should('exist')
  })

  it('says so when no place is found', () => {
    cy.intercept('GET', SEARCH, [])
    cy.visitAs('hiker', '/')

    search('Nowhereland')

    cy.contains('.map-search__message', 'No trail or place found').should('be.visible')
    cy.get(MARKER).should('not.exist')
  })

  it('says so when the search cannot be reached', () => {
    cy.intercept('GET', SEARCH, { forceNetworkError: true })
    cy.visitAs('hiker', '/')

    search('Andalo')

    cy.contains('.map-search__message', 'not available').should('be.visible')
  })

  it('clears the search and the marker', () => {
    cy.intercept('GET', SEARCH, [andalo])
    cy.visitAs('hiker', '/')
    search('Andalo')
    cy.get(MARKER).should('exist')

    cy.get('.map-search__clear').click()

    cy.get('.map-search__input').should('have.value', '')
    cy.get(MARKER).should('not.exist')
  })

  it('does nothing for an empty search', () => {
    cy.intercept('GET', SEARCH, cy.spy().as('request'))
    cy.visitAs('hiker', '/')

    cy.get('.map-search__input').type('   {enter}')

    cy.get('@request').should('not.have.been.called')
  })

  describe('on a phone', () => {
    beforeEach(() => {
      cy.viewport(360, 660)
    })

    it('sits on the top of the map, above the other buttons', () => {
      cy.visitAs('hiker', '/')

      cy.get('.map-search').then(($search) => {
        const search = $search[0].getBoundingClientRect()
        cy.get('.leaflet-top.leaflet-left .locate-button').then(($button) => {
          expect(search.bottom).to.be.at.most($button[0].getBoundingClientRect().top)
        })
        expect(search.left).to.be.lessThan(20)
        expect(search.right).to.be.greaterThan(340)
      })
    })

    it('goes to the place and the list shows the trails around it', () => {
      cy.intercept('GET', SEARCH, [andalo])
      cy.visitAs('hiker', '/')

      search('Andalo')

      cy.get(MARKER).should('exist')
      cy.get('.map-page__sidebar-toggle').should('contain', 'Trails')
    })
  })
})

describe('Search of a place on the admin maps', () => {
  beforeEach(() => {
    cy.intercept('GET', SEARCH, [andalo]).as('search')
  })

  it('is on the map of the dashboard', () => {
    cy.visitAs('admin', '/admin')

    cy.get('.admin-page__map-wrap .map-search').should('be.visible')
    search('Andalo')
    cy.wait('@search')
    cy.get('.map-search__input').should('contain.value', 'Andalo')
  })

  it('is on the map of the trails page', () => {
    cy.visitAs('admin', '/admin/trails')

    cy.get('.admin-trails-page__map-card .map-search').should('be.visible')
    search('Andalo')
    cy.wait('@search')
    cy.get('.map-search__input').should('contain.value', 'Andalo')
  })
})

describe('Search of a trail by name', () => {
  beforeEach(() => {
    cy.intercept('GET', SEARCH, []).as('places')
  })

  it('suggests the trail while the person is typing', () => {
    cy.visitAs('hiker', '/')

    cy.get('.map-search__input').type('ceda')

    cy.contains('.map-search__result--trail', E2E_TRAIL_NAME).should('be.visible')
    cy.get('@places.all').should('have.length', 0)
  })

  it('finds the trail even when the words are in another order', () => {
    cy.visitAs('hiker', '/')

    cy.get('.map-search__input').type('ceda sentiero')

    cy.contains('.map-search__result--trail', E2E_TRAIL_NAME).should('be.visible')
  })

  it('selects the trail on the map and in the list when it is chosen', () => {
    cy.visitAs('hiker', '/')
    cy.get('.map-search__input').type('ceda')

    cy.contains('.map-search__result--trail', E2E_TRAIL_NAME).click()

    cy.get('.map-search__input').should('have.value', E2E_TRAIL_NAME)
    cy.get('.map-search__result').should('not.exist')
    cy.get('.trails-sidebar__item--selected').should('contain', E2E_TRAIL_NAME)
  })

  it('goes straight to the trail when it is the only one found', () => {
    cy.visitAs('hiker', '/')

    cy.get('.map-search__input').type('sentiero ceda{enter}')

    cy.get('.trails-sidebar__item--selected').should('contain', E2E_TRAIL_NAME)
  })

  it('closes the keyboard once the search is sent', () => {
    cy.visitAs('hiker', '/')

    cy.get('.map-search__input').type('Nowhereland{enter}')

    cy.contains('.map-search__message', 'No trail or place found').should('be.visible')
    cy.get('.map-search__input').should('not.be.focused')
  })

  it('works on the trails page of the admin', () => {
    cy.visitAs('admin', '/admin/trails')
    cy.get('.map-search__input').type('ceda')

    cy.contains('.map-search__result--trail', E2E_TRAIL_NAME).click()

    cy.get('.admin-trail-panel__name').should('contain', E2E_TRAIL_NAME)
  })
})
