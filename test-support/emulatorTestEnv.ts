/**
 * Fail-closed guard against a real incident: running the Firestore/Storage
 * rules test suites directly against the already-running ArtVault
 * development emulator once wiped its real Auth/Firestore data, because
 * those suites call `clearFirestore()` (and equivalent Storage clearing) in
 * their own setup hooks, and the dev emulator holds real, persistent owner
 * data on the exact same ports/project id these test files used to
 * hardcode. See ARTVAULT_PROJECT_STATE.md's Module 08 write-up for the
 * full incident and recovery.
 *
 * The fix is two independent layers, both enforced here:
 *
 * 1. **Process isolation** — `npm run test:rules`/`test:storage-rules` now
 *    launch a dedicated, disposable emulator via `firebase emulators:exec`
 *    (see package.json and scripts/exec-*-tests.mjs), configured by
 *    firebase.test.json on ports (8280/9399) that are physically distinct
 *    from the dev emulator's (8080/9199/9099) — a connection attempt to the
 *    wrong port simply fails, it cannot silently succeed against the dev
 *    instance. `emulators:exec` is inherently ephemeral: no `--import`, no
 *    `--export-on-exit`, so nothing here ever touches or produces
 *    persistent state at all.
 * 2. **This runtime guard** — every rules-test file calls
 *    `assertIsolatedFirestoreTestEnvironment()`/
 *    `assertIsolatedStorageTestEnvironment()` before its first destructive
 *    call. Each is fail-closed: it throws immediately (aborting the whole
 *    test file, before any clear/seed operation runs) unless the emulator
 *    host environment variable `firebase emulators:exec` sets is both
 *    present and does NOT match a known dev-emulator port. A file run via
 *    bare `vitest run` (bypassing `emulators:exec` entirely) has no such
 *    env var set at all and is refused for that reason alone — there is no
 *    hardcoded fallback host/port anywhere in this module for it to
 *    silently fall back to.
 */

const DEV_FIRESTORE_PORT = 8080
const DEV_STORAGE_PORT = 9199
const DEV_PROJECT_ID = 'demo-artvault'

/** The project id every isolated rules-test file must use — never DEV_PROJECT_ID. */
export const TEST_PROJECT_ID = 'demo-artvault-test'

export interface EmulatorAddress {
  host: string
  port: number
}

function parseEmulatorHost(value: string | undefined): EmulatorAddress | null {
  if (!value) return null
  const lastColon = value.lastIndexOf(':')
  if (lastColon === -1) return null
  const host = value.slice(0, lastColon)
  const port = Number.parseInt(value.slice(lastColon + 1), 10)
  if (!host || !Number.isInteger(port)) return null
  return { host, port }
}

function assertIsolated(envVarName: string, devPort: number, serviceLabel: string): EmulatorAddress {
  const parsed = parseEmulatorHost(process.env[envVarName])
  if (!parsed) {
    throw new Error(
      `${envVarName} is not set. This ${serviceLabel} rules test suite must be run via its npm script ` +
        `(e.g. \`npm run test:rules\`), which launches an isolated, disposable emulator via ` +
        `\`firebase emulators:exec\` — never by invoking vitest directly against a manually-started ` +
        `emulator. Refusing to run rather than risk connecting to nothing, or to the real dev emulator.`,
    )
  }
  if (parsed.port === devPort) {
    throw new Error(
      `Refusing to run: ${envVarName} points at port ${devPort}, the real ArtVault development ` +
        `${serviceLabel} emulator port. This test suite calls clearFirestore()/equivalent destructive ` +
        `setup and must never run against that instance, which holds real, persistent owner data. ` +
        `Run it via its npm script instead, which targets the dedicated isolated test emulator ` +
        `(see firebase.test.json).`,
    )
  }
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT === DEV_PROJECT_ID) {
    throw new Error(
      `Refusing to run: GCLOUD_PROJECT is "${DEV_PROJECT_ID}", the real ArtVault development project id. ` +
        `Isolated rules tests must run under "${TEST_PROJECT_ID}" instead.`,
    )
  }
  return parsed
}

/** Call once per test file, before the first initializeTestEnvironment()/destructive call. */
export function assertIsolatedFirestoreTestEnvironment(): EmulatorAddress {
  return assertIsolated('FIRESTORE_EMULATOR_HOST', DEV_FIRESTORE_PORT, 'Firestore')
}

/** Call once per test file, before the first initializeTestEnvironment()/destructive call. */
export function assertIsolatedStorageTestEnvironment(): EmulatorAddress {
  return assertIsolated('FIREBASE_STORAGE_EMULATOR_HOST', DEV_STORAGE_PORT, 'Storage')
}
