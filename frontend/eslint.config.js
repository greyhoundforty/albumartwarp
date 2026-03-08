import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'

export default [
  // Base ESLint recommended rules (catches common JS mistakes)
  js.configs.recommended,

  // Apply to all JS/JSX files in src/ and tests/
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Browser globals (window, document, fetch, etc.)
        ...globals.browser,
        // Vitest globals (describe, it, expect, vi, beforeEach, etc.)
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React rules
      ...react.configs.recommended.rules,
      // Enforce the rules of hooks (must call hooks at top level, etc.)
      ...reactHooks.configs.recommended.rules,
      // Warn if you export components incorrectly for HMR (hot module reload)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Style preferences
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',

      // Turn off prop-types rule (we use JSDoc comments instead)
      'react/prop-types': 'off',
      // React 17+ doesn't need 'import React' at the top of every file
      'react/react-in-jsx-scope': 'off',
    },
  },
]
