import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'docs/**']
  },

  js.configs.recommended,

  ...pluginVue.configs['flat/essential'],

  {
    files: ['client/**/*.{js,vue}'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },

  {
    files: ['server/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  {
    files: ['cypress.config.js', 'cypress/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.mocha,
        cy: 'readonly',
        expect: 'readonly',
        Cypress: 'readonly'
      }
    }
  },

  skipFormatting
]
