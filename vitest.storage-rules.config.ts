import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['storage-tests/**/*.test.ts'],
    // Mirrors vitest.rules.config.ts's reasoning: these tests share one
    // real Storage/Firestore emulator pair and each seeds/clears fixtures
    // per-file, so running files in parallel risks the same kind of
    // cross-file race Module 04 already hit and fixed for firestore-tests.
    fileParallelism: false,
  },
})
