import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // scripts/start-emulators.mjs itself is a top-level-executing entry
    // point (spawns a real child process on import) and isn't unit-tested
    // directly — its lock/orphan/readiness decision logic lives in
    // scripts/lib/*.mjs specifically so it can be exercised here.
    include: ['scripts/**/*.test.mjs'],
  },
})
