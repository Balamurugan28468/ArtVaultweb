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
  server: {
    port: 5173,
    // Fail loudly instead of silently starting on 5174/5175 — a stray dev
    // server on an unexpected port has been a real, repeated source of
    // confusion (an open browser tab left pointed at the wrong origin after
    // a duplicate `npm run dev` was started, then torn down). One dev
    // server, always on 5173, or a clear "port in use" error telling you to
    // find and stop whatever's already running there.
    strictPort: true,
    watch: {
      // Proven root cause of a real data-loss incident: Vite's dev-server
      // file watcher holds an open handle on ./emulator-data for as long as
      // `npm run dev` is running (confirmed directly — renaming
      // ./emulator-data fails with "Access denied" while the dev server is
      // up, and succeeds immediately once it's stopped, with the emulator
      // suite left running throughout). `firebase emulators:start
      // --export-on-exit` replaces ./emulator-data by removing the old
      // directory and renaming a fresh export into place; with that lock
      // held, the removal silently fails and the fresh export is stranded
      // in an orphaned `firebase-export-<timestamp>/` directory instead —
      // meaning, under the exact all-day "both processes always running"
      // workflow this project's own daily workflow calls for, no new
      // emulator state could ever actually persist across a restart. Vite
      // has no reason to watch this directory at all — it's local dev
      // Firestore/Auth/Storage snapshot data, never imported into the app
      // bundle — so it and its transient recovery-staging siblings are
      // excluded outright.
      ignored: ['**/emulator-data/**', '**/firebase-export-*/**'],
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
