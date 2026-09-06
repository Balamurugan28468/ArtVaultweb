import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['firestore-tests/**/*.test.ts'],
    // Every *.rules.test.ts file shares one real Firestore emulator
    // instance/project, and each calls testEnv.clearFirestore() in its own
    // beforeEach — a whole-project wipe, not scoped to that file's own
    // fixtures. Running files in parallel (Vitest's default) lets one
    // file's clearFirestore() wipe another file's in-flight fixture data
    // out from under it — a real, intermittent cross-file race, not a
    // rules-logic bug (confirmed: every test here passes reliably once
    // serialized). Module 04 introduced the second and third rules test
    // files; a single file never exercised this.
    fileParallelism: false,
    // The isolated test emulator (see run-isolated-emulator-tests.mjs) is
    // started fresh for every run, unlike the persistent dev emulator this
    // suite used to (unsafely) share — its very first initializeTestEnvironment()
    // call can take longer than Vitest's 10s default hook timeout while the
    // JVM is still warming up. 20s is generous headroom, not a sign
    // anything is actually slow in steady state.
    hookTimeout: 20000,
    // The very first real Firestore call against the freshly-started
    // isolated test emulator can also exceed Vitest's 5s default test
    // timeout while the JVM is still warming up — same reasoning as
    // hookTimeout above.
    testTimeout: 15000,
  },
})
