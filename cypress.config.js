import { defineConfig } from 'cypress'
import {
  getHikerReputation,
  getTrailStatus,
  insertActivity,
  insertNotifications,
  insertReports,
  insertTrailHistory,
  listReports,
  proposeClosure,
  seedDatabase,
  setHikerReputation,
  updateTrail
} from './cypress/support/db.js'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    defaultCommandTimeout: 8000,
    retries: { runMode: 2, openMode: 0 },
    setupNodeEvents(on) {
      on('task', {
        'db:seed': seedDatabase,
        'db:insertReports': insertReports,
        'db:reports': listReports,
        'db:trailStatus': getTrailStatus,
        'db:setReputation': setHikerReputation,
        'db:reputation': getHikerReputation,
        'db:insertNotifications': insertNotifications,
        'db:insertActivity': insertActivity,
        'db:insertTrailHistory': insertTrailHistory,
        'db:updateTrail': updateTrail,
        'db:proposeClosure': proposeClosure
      })
    }
  }
})
