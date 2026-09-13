// Module 13 Phase 4 durability hardening — creates a live, consistent
// checkpoint of the *running* Firebase Emulator Suite's Auth + Firestore
// state, without stopping it. Exists because `--export-on-exit` (the
// existing, unchanged mechanism scripts/start-emulators.mjs already
// provides) only ever runs on a *clean* shutdown — an emulator suite that
// crashes or is killed (this machine's own documented RAM pressure has now
// done this for real, see ARTVAULT_PROJECT_STATE.md) loses every change
// since the last successful export, silently reverting on the next start to
// whatever was last saved, which can be hours or days of real work old.
//
// Uses the *official* `firebase emulators:export` CLI command — the same
// command a human would type — which talks to the already-running Emulator
// Hub to request one atomic, cross-service-consistent export (Auth and
// Firestore captured together, from the same instant, never two separately
// -timed reads that could disagree with each other). This file never reads
// or copies the emulators' own live LevelDB/on-disk files directly, which
// would risk capturing a mid-write, inconsistent state.
//
// Usage: `npm run checkpoint:emulators` — the emulator suite must already
// be running (started the normal way, `npm run emulators`). See "When to
// run this" in docs/DEPLOYMENT.md for the manual-milestone guidance this
// project deliberately chose over an automatic periodic checkpoint (see
// this file's own rationale below).
//
// Safety, matching (and reusing, via ./lib/emulatorExport.mjs) exactly the
// same guarantees scripts/start-emulators.mjs's own export-on-exit path
// already provides:
//   1. The new export is written to a disposable staging directory first —
//      ./emulator-data itself is never touched until the new export has
//      been independently validated as complete via isCompleteExport().
//   2. A failed, incomplete, or invalid export is discarded (staging
//      directory removed); ./emulator-data and ./emulator-data.backup are
//      left completely untouched — never partially overwritten.
//   3. Only once validated: the *current* ./emulator-data is preserved at
//      ./emulator-data.backup (the same single rolling backup slot the
//      launcher already uses) before the new checkpoint takes its place —
//      so a checkpoint can never leave zero valid recovery points on disk.
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPortListening } from './lib/emulatorGuards.mjs'
import { isCompleteExport, renameWithRetry, writeSnapshotManifest } from './lib/emulatorExport.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportDir = path.join(projectRoot, 'emulator-data')
const backupDir = `${exportDir}.backup`
// Named to start with "firebase-export-" — the exact prefix
// vite.config.ts's watcher already ignores (`**/firebase-export-*/**`,
// added for start-emulators.mjs's own recovery-staging directories) — so
// Vite never holds a file handle on this directory while it's being
// written, which would otherwise make the final rename below fail with a
// real Windows EPERM (confirmed directly while building this script: it
// failed exactly this way before this directory was renamed to match).
// Deliberately does NOT match start-emulators.mjs's own
// `/^firebase-export-\d+/` orphan-recovery pattern (no digits immediately
// after the prefix) — a leftover from an interrupted checkpoint attempt
// must never be mistaken by that unrelated mechanism for one of *its* own
// stranded exports.
const stagingDir = path.join(projectRoot, 'firebase-export-checkpoint-staging')

// The exact ports the running suite must actually be listening on for a
// checkpoint to mean anything — matches firebase.json. Checked directly
// (never assumed from a PID or a lock file) so a genuinely stopped or only
// partially-up suite is refused loudly rather than producing a checkpoint
// missing a service — the owner's own "never restore mismatched
// generations" requirement starts with never *capturing* a mismatched one.
const REQUIRED_PORTS = { 'Emulator Hub': 4400, Firestore: 8080, Authentication: 9099 }

async function assertEmulatorsRunning() {
  const results = await Promise.all(
    Object.entries(REQUIRED_PORTS).map(async ([name, port]) => [name, port, await isPortListening(port)]),
  )
  const down = results.filter(([, , up]) => !up)
  if (down.length > 0) {
    console.error(
      `Cannot checkpoint — the emulator suite isn't fully running. Not listening: ${down
        .map(([name, port]) => `${name} (port ${port})`)
        .join(', ')}. Start it first with \`npm run emulators\`, then retry.`,
    )
    process.exit(1)
  }
}

function runFirebaseExport() {
  const localFirebaseBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase')
  const useLocalCli = existsSync(localFirebaseBin)
  const command = useLocalCli ? localFirebaseBin : 'npx'
  const commandArgs = useLocalCli ? [] : ['firebase-tools']

  // `--force` skips the interactive "overwrite?" prompt firebase-tools would
  // otherwise show — never a risk here since stagingDir is always removed
  // and recreated fresh immediately before this runs, below.
  const exportArgs = ['emulators:export', stagingDir, '--project', 'demo-artvault', '--force']

  // Same fixed-string-plus-shell:true pattern used throughout this
  // project's other emulator scripts (start-emulators.mjs,
  // run-isolated-emulator-tests.mjs) — every argument here is a literal,
  // code-controlled value, never user input, so there is nothing for shell
  // quoting to get wrong.
  const commandLine = [command, ...commandArgs, ...exportArgs].join(' ')

  return new Promise((resolve) => {
    const child = spawn(commandLine, { cwd: projectRoot, stdio: 'inherit', shell: true })
    child.on('exit', (code) => resolve(code ?? 1))
    child.on('error', (error) => {
      console.error(`Failed to run the Firebase CLI: ${error.message}`)
      resolve(1)
    })
  })
}

async function main() {
  await assertEmulatorsRunning()

  // Always start from a clean staging directory — a leftover from a
  // previous failed/interrupted checkpoint attempt is disposable by
  // definition (it was never promoted to ./emulator-data) and must never be
  // mistaken for anything current.
  rmSync(stagingDir, { recursive: true, force: true })

  console.log('Requesting a live export from the running emulator suite (Auth + Firestore, captured together)...')
  const exitCode = await runFirebaseExport()

  const exportedCleanly = exitCode === 0 && isCompleteExport(stagingDir)
  if (!exportedCleanly) {
    rmSync(stagingDir, { recursive: true, force: true })
    console.error(
      '\nCheckpoint failed — the export did not complete successfully or was incomplete. ' +
        './emulator-data and ./emulator-data.backup were never touched; your existing checkpoint is exactly as it was before this command ran.',
    )
    process.exit(1)
  }

  console.log('\nExport validated as complete. Promoting it to the active checkpoint...')

  try {
    if (existsSync(exportDir) && isCompleteExport(exportDir)) {
      rmSync(backupDir, { recursive: true, force: true })
      await renameWithRetry(exportDir, backupDir)
      console.log('Previous checkpoint preserved at ./emulator-data.backup.')
    }
    await renameWithRetry(stagingDir, exportDir)
    writeSnapshotManifest(exportDir)
  } catch (error) {
    console.error(
      `\nA filesystem error occurred while promoting the validated export: ${error.message}\n` +
        `The validated export itself is safe at ${path.relative(projectRoot, stagingDir)} — move it to ` +
        `./emulator-data yourself if this doesn't resolve on a retry.`,
    )
    process.exit(1)
  }

  console.log(
    '\n✔ Checkpoint complete. ./emulator-data now reflects the emulator suite\'s current live state ' +
      '(Auth + Firestore, captured consistently together). The emulator suite itself was never stopped — ' +
      'this only wrote its current state to disk. A future crash can now only lose changes made *after* this checkpoint.',
  )
}

await main()
