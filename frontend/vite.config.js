import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Dev server config
  server: {
    port: 5173,
    // Proxy API calls to the FastAPI backend so we avoid CORS issues in dev.
    // e.g. fetch('/api/audio/upload') → http://localhost:8000/api/audio/upload
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  // Test config (vitest reads this section)
  test: {
    // jsdom emulates a browser DOM in Node.js for component tests
    environment: 'jsdom',
    // Run this file before each test file to set up mocks
    setupFiles: ['./tests/setup.js'],
    globals: true,
    // Tell vitest where to look for tests
    include: ['tests/**/*.test.{js,jsx}'],
  },
})
