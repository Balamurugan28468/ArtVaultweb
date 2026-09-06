// Launches a dedicated, disposable Firebase emulator (firebase.test.json —
// different ports, different project id, no persistence) via
// `firebase emulators:exec`, runs one rules-test suite inside it, and
// shuts the emulator back down — never touching, or even being able to
// reach, the real ArtVault development emulator (see scripts/
// start-emulators.mjs), which holds real, persistent owner data.
//
// This exists because running these suites directly against the
// already-running dev emulator once wiped its real Auth/Firestore state —
// those suites call clearFirestore() (and equivalent Storage clearing) in
// their own setup hooks. See ARTVAULT_PROJECT_STATE.md's Module 08
// write-up and test-support/emulatorTestEnv.ts (the runtime guard every
// rules-test file also calls, independent of this launcher, as a second
// layer of defense).
//
// Usage: `npm run test:rules` / `npm run test:storage-rules` (do not invoke
// this directly with arbitrary arguments).

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { envWithResolvedJavaOnPath, resolveJavaOrExit } from './lib/javaRuntime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SUITES = {
  firestore: { services: 'firestore', script: 'scripts/exec-rules-tests.mjs' },
  storage: { services: 'firestore,storage', script: 'scripts/exec-storage-rules-tests.mjs' },
}

const suiteName = process.argv[2]
const suite = SUITES[suiteName]
if (!suite) {
  console.error(`usage: node scripts/run-isolated-emulator-tests.mjs ${Object.keys(SUITES).join('|')}`)
  process.exit(1)
}

const resolved = resolveJavaOrExit()
const childEnv = envWithResolvedJavaOnPath(resolved)

// Same "one fixed, code-controlled command-line string + shell:true"
// pattern start-emulators.mjs already uses, for the same reason: every
// argument here is a literal, never user input, so there is nothing for
// shell quoting to get wrong.
const commandLine = [
  'npx',
  'firebase-tools',
  'emulators:exec',
  '--config',
  'firebase.test.json',
  '--project',
  'demo-artvault-test',
  '--only',
  suite.services,
  `"node ${suite.script}"`,
].join(' ')

console.log(`Starting an isolated, disposable emulator (firebase.test.json) for the "${suiteName}" rules tests...`)

const result = spawnSync(commandLine, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: childEnv,
})

process.exit(result.status ?? 1)
