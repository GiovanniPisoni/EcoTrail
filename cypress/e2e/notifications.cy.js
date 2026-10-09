describe('Notifications', () => {
  it('shows an empty state without notifications', () => {
    cy.visitAs('hiker', '/notifications')
    cy.contains('No notifications yet').should('be.visible')
    cy.get('.unread-badge').should('not.exist')
  })

  describe('with a history', () => {
    beforeEach(() => {
      cy.task('db:insertNotifications', [
        {
          type: 'emergency',
          title: 'Trail closed',
          body: 'Closed after a landslide',
          url: '/profile',
          minutesAgo: 5
        },
        {
          type: 'overcrowd',
          title: 'Trail is crowded',
          body: 'Try a quieter trail',
          minutesAgo: 20
        },
        { type: 'approach', title: 'Danger ahead', minutesAgo: 60, read: true }
      ])
      cy.visitAs('hiker', '/notifications')
    })

    it('lists the notifications from the newest and counts the unread ones', () => {
      cy.get('.notifications-page__item').should('have.length', 3)
      cy.get('.notifications-page__item').first().should('contain', 'Trail closed')
      cy.get('.unread-badge').should('have.text', '2')
      cy.get('.notifications-page__item--unread').should('have.length', 2)
    })

    it('marks a notification as read when it is opened', () => {
      cy.intercept('PATCH', '/api/notifications/*/read').as('markRead')

      cy.contains('.notifications-page__item', 'Trail is crowded').click()

      cy.wait('@markRead').its('response.statusCode').should('eq', 200)
      cy.get('.unread-badge').should('have.text', '1')
      cy.contains('.notifications-page__item', 'Trail is crowded').should(
        'not.have.class',
        'notifications-page__item--unread'
      )
    })

    it('follows the link of a notification', () => {
      cy.contains('.notifications-page__item', 'Trail closed').click()
      cy.location('pathname').should('eq', '/profile')
    })

    it('marks every notification as read', () => {
      cy.intercept('PATCH', '/api/notifications/read-all').as('readAll')

      cy.contains('button', 'Mark all as read').click()

      cy.wait('@readAll').its('response.statusCode').should('eq', 200)
      cy.get('.unread-badge').should('not.exist')
      cy.contains('button', 'Mark all as read').should('not.exist')
      cy.get('.notifications-page__item--unread').should('not.exist')
    })
  })

  describe('preferences', () => {
    beforeEach(() => {
      cy.intercept('PATCH', '/api/notifications/preferences').as('savePreferences')
      cy.visitAs('hiker', '/notifications')
      cy.contains('Alert me when I').should('be.visible')
    })

    it('changes the alert radius', () => {
      cy.contains('label', 'Alert me when I')
        .find('select')
        .then(($select) => {
          const other = [...$select.find('option')].find((option) => option.value !== $select.val())
          cy.wrap($select).select(other.value)
        })
      cy.wait('@savePreferences').its('response.statusCode').should('eq', 200)
    })

    it('turns an alert type on and off', () => {
      cy.contains('.notifications-page__type', 'Crowded trails')
        .find('input')
        .then(($input) => {
          const wasChecked = $input.prop('checked')
          cy.wrap($input).click()
          cy.wait('@savePreferences').its('response.statusCode').should('eq', 200)
          cy.wrap($input).should(wasChecked ? 'not.be.checked' : 'be.checked')
        })
    })

    it('silences the alerts and turns them back on', () => {
      cy.contains('button', 'For 1 hour').click()
      cy.wait('@savePreferences').its('response.statusCode').should('eq', 200)
      cy.contains('Alerts are silenced until').should('be.visible')

      cy.contains('button', 'Turn alerts back on').click()
      cy.wait('@savePreferences')
      cy.contains('Silence alerts').should('be.visible')
      cy.contains('Alerts are silenced until').should('not.exist')
    })
  })
})
