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
    // See vitest.rules.config.ts — the isolated test emulator starts fresh
    // for every run and can be slower on its very first request.
    hookTimeout: 20000,
    // See vitest.rules.config.ts — same cold-JVM reasoning for individual
    // tests, not just the setup hook.
    testTimeout: 15000,
  },
})
