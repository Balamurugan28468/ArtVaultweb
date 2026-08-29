import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    pool: 'threads',
    // Scoped to src/ so this never picks up firestore-tests/ (a separate
    // suite that needs a live Firestore emulator — see vitest.rules.config.ts).
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
