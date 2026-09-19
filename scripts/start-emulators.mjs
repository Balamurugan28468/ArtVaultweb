// Starts the existing Firebase suite from the newest validated generation.
// Prior snapshots are immutable; clean shutdown exports to a NEW directory.
// Startup/checkpoint never delete or rotate historical snapshots.
import { spawn } from 'node:child_process'
import { writeFileSync, utimesSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findOrphanEmulatorPorts,
  findOrphanEmulatorProcesses,
  isLauncherProcess,
  readLockPid,
  releaseLockIfOwnedBySelf,
  waitForPortsState,
} from './lib/emulatorGuards.mjs'
import { SNAPSHOT_ROOT, scanSnapshots, selectSnapshot, printSnapshot, newSnapshotPath, publishSnapshot, atomicJson } from './lib/emulatorSnapshot.mjs'
import { envWithResolvedJavaOnPath, resolveJavaOrExit } from './lib/javaRuntime.mjs'
import { DISCOVERY_TIMEOUT_SECONDS, waitForFunctionsRegistration } from './lib/functionsReadiness.mjs'
import { createSessionLog } from './lib/emulatorSessionLog.mjs'
import { firebaseCli } from './lib/firebaseCli.mjs'
import { readLiveState } from './lib/readEmulatorState.mjs'
import { waitForPublicFirestore } from './lib/publicFirestoreReadiness.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockFile = path.join(projectRoot, '.emulator-launcher.lock')

// firebase.json's own emulator ports — the set this launcher requires to
// actually be listening before it will ever call startup "ready".
const REQUIRED_PORTS = { firestore: 8080, auth: 9099, storage: 9199, functions: 5001 }

// Only one Firebase Emulator Suite may own ./emulator-data at a time — two
// launchers racing to import/export it concurrently is exactly how a
// coherent generation gets assembled from mismatched Auth/Firestore
// snapshots (observed directly on this project). A PID-stamped lock file
// (never inside emulator-data itself, so it's never mistaken for
// persistence data) makes a second, unaware launcher exit immediately
// instead of touching anything. isLauncherProcess() (not just a plain
// liveness check) exists because Windows recycles PIDs quickly: a launcher
// that was force-killed rather than shut down cleanly leaves a lock file
// behind naming a PID that can be reassigned to a totally unrelated process
// by the time the next launch runs — a plain "is *a* process alive at this
// PID" check would then wrongly treat that lock as still held.
function acquireSingleInstanceLock() {
  const heldPid = readLockPid(lockFile)
  if (heldPid !== null) {
    if (isLauncherProcess(heldPid)) {
      console.error(
        `Another ArtVault emulator launcher is already running (PID ${heldPid}). Exiting without touching ` +
          `persistence, ports, or exports. Stop that session first if you need to restart the emulators.`,
      )
      process.exit(1)
    }
    // Stale lock (the process that held it is gone, or the PID now belongs
    // to something else entirely — e.g. it crashed without a clean exit) —
    // safe to reclaim; nothing about *persistence* is touched here, only
    // this coordination file. The required ports may still be held by that
    // dead launcher's orphaned children, though — see
    // cleanUpOrphanedEmulatorProcesses() below, run right after this.
    console.log('Found a stale launcher lock from a process that is no longer running — reclaiming it.')
    releaseLockIfOwnedBySelf(lockFile, heldPid)
  }
  writeFileSync(lockFile, String(process.pid), { encoding: 'utf8', flag: 'wx' })
}

function releaseSingleInstanceLock() {
  releaseLockIfOwnedBySelf(lockFile, process.pid)
}

// Combines the two orphan-detection strategies into one deduplicated list:
// findOrphanEmulatorPorts (anchored to a fixed port — the only way to prove
// a REQUIRED port's occupant is safe to remove) and
// findOrphanEmulatorProcesses (identity-only, no port needed at all — the
// only way to ever find a Functions worker, which binds to a different,
// unpredictable port every run and so can never be caught by the
// port-anchored check). Both independently require looksLikeArtVaultEmulator
// Process() to prove ownership before something is ever included here.
function findAllOwnedOrphans() {
  const byPort = findOrphanEmulatorPorts({ ports: REQUIRED_PORTS, projectRoot })
  const byIdentity = findOrphanEmulatorProcesses({ projectRoot, excludePids: [process.pid] })

  const owned = new Map()
  for (const p of byPort.owned) owned.set(p.pid, { pid: p.pid, description: `${p.name} (port ${p.port})` })
  for (const p of byIdentity.owned) if (!owned.has(p.pid)) owned.set(p.pid, { pid: p.pid, description: p.description })

  return { owned: [...owned.values()], unidentified: byPort.unidentified }
}

// A launcher that was force-killed (rather than shut down via Ctrl+C) can
// leave its emulator child processes running even after its own lock is
// recognized as stale above — nothing else ever stopped them. Starting a
// second `firebase emulators:start` on top of those still-bound ports is
// exactly how a genuinely broken, partial suite happens (observed directly:
// an orphaned Firestore process alone answering on 8080 while Auth/Storage,
// belonging to no running process at all, sit dead — and separately, an
// orphaned Functions worker on its own dynamic port, invisible to a
// port-anchored check entirely). Refuse startup when such a process remains:
// it may hold the only in-memory copy of unsaved owner data. Never force-kill
// it automatically during startup.
async function cleanUpOrphanedEmulatorProcesses() {
  const { owned, unidentified } = findAllOwnedOrphans()

  if (unidentified.length > 0) {
    const details = unidentified.map((p) => `${p.name} (port ${p.port}, PID ${p.pid})`).join(', ')
    console.error(
      `Required port(s) already in use by a process this launcher cannot verify belongs to ArtVault's own ` +
        `emulator suite: ${details}. Not touching it — stop whatever is using that port yourself, then retry.`,
    )
    releaseSingleInstanceLock()
    process.exit(1)
  }

  if (owned.length === 0) return

  throw new Error('Existing emulator processes may contain unsaved data. Refusing to terminate them automatically. Preserve/export that session before restarting.')
}

acquireSingleInstanceLock()
process.on('exit', releaseSingleInstanceLock)
await cleanUpOrphanedEmulatorProcesses()
const sessionLog=createSessionLog(projectRoot)
console.log('Persistent emulator session log:',sessionLog.file)
process.on('exit',code=>sessionLog.record('launcher-exit',{code}))

const resolved = resolveJavaOrExit()
console.log(`Using Java ${resolved.version} (via ${resolved.source}).`)

const candidates = scanSnapshots(projectRoot)
for (const candidate of candidates) if (candidate.invalid) console.error('INVALID SNAPSHOT (retained):', candidate.path, candidate.invalid)
const importedSnapshot = selectSnapshot(candidates)
printSnapshot(importedSnapshot)
sessionLog.record('snapshot-selected',{path:importedSnapshot.path,generation:importedSnapshot.generation,counts:importedSnapshot.counts})
// Compile once BEFORE Functions starts watching. Reconciliation must not run tsc.
console.log('Building Functions before starting emulators...')
const buildCode = await new Promise((resolve,reject)=>{
  const compiler=spawn(process.execPath,[path.join(projectRoot,'functions/node_modules/typescript/bin/tsc')],{cwd:path.join(projectRoot,'functions'),stdio:'inherit'})
  compiler.on('error',reject);compiler.on('close',resolve)
})
if (buildCode !== 0) throw new Error('Functions build failed; emulator startup cancelled without changing snapshots')
if (process.versions.node.split('.')[0] !== '22') console.warn(`Node runtime mismatch: Functions requests 22; this launcher is using ${process.versions.node}. Use Node 22 for runtime parity. This warning alone does not prove a function failure.`)
// Never point Firebase's destructive export replacement at a previous generation.
const sessionExport = newSnapshotPath(projectRoot, 'shutdown')
await atomicJson(path.join(projectRoot, SNAPSHOT_ROOT, 'session.json'), {
  pid: process.pid, startedAt: new Date().toISOString(), importedFrom: importedSnapshot.path,
  snapshotTimestamp: importedSnapshot.timestamp, generation: importedSnapshot.generation, exportTo: sessionExport,
})

const emulatorArgs = ['emulators:start', '--project=demo-artvault', '--import=' + importedSnapshot.path, '--export-on-exit=' + sessionExport]
console.log('Clean shutdown export destination (new generation):', sessionExport)
console.warn('Close app tabs and stop operator writes before checkpoint/shutdown. Firebase exports services sequentially, not as a cross-service transaction.')
console.warn('Ctrl+C ONCE and wait for SNAPSHOT SAVED. Terminal close, force-kill, VS Code close or crash can lose changes since the last checkpoint.')

// Put whichever Java bin/ directory resolveJava() actually settled on first
// in *this child's* PATH — so the spawned Firestore Emulator reliably uses
// that exact runtime too, however it was found (JAVA_HOME, an already-good
// PATH, or the install-directory fallback scan), even when the user's own
// raw system PATH would otherwise resolve an older `java` first. See
// lib/javaRuntime.mjs — the same helper the isolated test-emulator launcher
// (run-isolated-emulator-tests.mjs) uses for the exact same reason.
const childEnv = envWithResolvedJavaOnPath(resolved)
childEnv.FUNCTIONS_DISCOVERY_TIMEOUT = String(DISCOVERY_TIMEOUT_SECONDS)
// Firebase CLI otherwise deletes firebase-debug.log on an ordinary exit.
childEnv.DEBUG = 'true'

const child = spawn(process.execPath, [firebaseCli(projectRoot), ...emulatorArgs], {
  cwd: projectRoot,
  stdio: ['inherit', 'pipe', 'pipe'],
  // Run the installed JavaScript CLI directly, without a Windows command shim.
  shell: false,
  env: childEnv,
})
sessionLog.record('firebase-child-start',{pid:child.pid,discoveryTimeoutSeconds:DISCOVERY_TIMEOUT_SECONDS})

let readinessSeen = false
let reconciliationFinished = false
let outputTail = ''

function forwardOutput(chunk, stream) {
  const text = chunk.toString()
  sessionLog.record(stream===process.stderr?'firebase-stderr':'firebase-stdout',{text})
  outputTail = (outputTail + text).slice(-4096)
  stream.write(text.replaceAll('All emulators ready!', 'Firebase ports started; ArtVault callable verification pending.').replaceAll('It is now safe to connect your app.', 'Wait for ARTVAULT READY before using the app.'))
  if (readinessSeen || !outputTail.includes('All emulators ready!')) return
  readinessSeen = true
  void runTrustedReconciliation('', stream).catch(error=>{sessionLog.record('readiness-failed',{error:error.message});console.error('ARTVAULT NOT READY:',error.message)})
}

async function runTrustedReconciliation(afterReadiness, stream) {
  await waitForFunctionsRegistration({recover:async()=>{
    console.warn('Functions are not registered; attempting ONE compiled-entry discovery reload. Data emulators remain running.')
    const now=new Date();utimesSync(path.join(projectRoot,'functions/lib/index.js'),now,now)
  }})
  const reconcile = spawn(process.execPath, ['lib/reconcileRoles.js'], {
    cwd: path.join(projectRoot, 'functions'),
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: 'demo-artvault',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  reconcile.stdout.on('data', (chunk) => stream.write(chunk))
  reconcile.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const code = await new Promise((resolve) => reconcile.on('close', resolve))
  if (code !== 0) {
    console.error(
      `Trusted role reconciliation failed with exit code ${code}. ` +
        'Do not start the web app; emulator startup is not ready.',
    )
    console.error('Stop using Ctrl+C in this terminal and wait for snapshot validation; no forced termination was attempted.')
    return
  }

  // firebase-tools printing "All emulators ready!" and reconciliation
  // succeeding both only prove the *hub* and *Firestore* came up — an
  // independent TCP check of every required port is the actual proof the
  // app can safely connect, rather than trusting that text line alone (the
  // exact gap behind a partial startup where Firestore answers but
  // Auth/Storage never bound at all).
  const portsReady = await waitForPortsState(Object.values(REQUIRED_PORTS), { want: 'listening', timeoutMs: 15000 })
  if (!portsReady.ok) {
    console.error(
      `Emulator suite reported ready, but required port(s) never came up: ${portsReady.missing.join(', ')}. ` +
        'Treating startup as failed — do not start the web app.',
    )
    console.error('Stop using Ctrl+C in this terminal and wait for snapshot validation; no forced termination was attempted.')
    return
  }

  // Verify real Auth/Firestore/Storage reads, not just listening sockets.
  const live = await readLiveState({ fingerprint: true })
  sessionLog.record('services-responsive', { counts: live.counts, fingerprint: live.fingerprint })
  const publicRead = await waitForPublicFirestore()
  if (live.counts.published > 0 && publicRead.publishedPageSize === 0) throw new Error('Published records exist but the public marketplace query returned none; startup is not ready')
  sessionLog.record('public-firestore-responsive', publicRead)
  reconciliationFinished = true
  if (afterReadiness) stream.write(afterReadiness)
  console.log('ARTVAULT READY — all expected callables registered, import and trusted role reconciliation completed.')
  sessionLog.record('artvault-ready')
}

child.stdout.on('data', (chunk) => forwardOutput(chunk, process.stdout))
child.stderr.on('data', (chunk) => forwardOutput(chunk, process.stderr))

// Deliberately do NOT let this wrapper process exit immediately on SIGINT.
// The child (spawned directly, sharing this console session) gets
// Ctrl+C directly from the console the same moment we do — Windows
// broadcasts a real console Ctrl+C to every process still attached to that
// console, not just direct children, so it reaches firebase-tools and the
// Firestore Emulator underneath it regardless of how many shell layers sit
// in between. firebase-tools then needs several seconds to run its own
// graceful shutdown and write the --export-on-exit data — this wrapper only
// exits once the child actually has, in the handler below, so a clean
// export always finishes before `npm run emulators` returns control to the
// terminal (never TerminateProcess/force-kill it yourself for the same
// reason — that skips this entirely and can leave ./emulator-data
// mid-write or stuck in a temp directory).
let shuttingDown = false
process.on('SIGINT', () => {
  sessionLog.record('launcher-signal',{signal:'SIGINT'})
  if (shuttingDown) return
  shuttingDown = true
  console.log('\nStopping — waiting for Firebase to finish the NEW snapshot. Do not close this terminal...')
})

child.on('close', async (code, signal) => {
  sessionLog.record('firebase-child-close',{code,signal,requestedShutdown:shuttingDown})
  // Seal the completed export immediately. Startup already refuses occupied ports
  // or leftover emulator processes; do not delay durable confirmation for a process scan.

  try {
    if (code !== 0 || signal || !reconciliationFinished) throw new Error('Emulator did not finish a clean, ready session')
    const saved = await publishSnapshot(projectRoot, sessionExport)
    sessionLog.record('snapshot-saved',{path:saved.path,generation:saved.generation,counts:saved.counts})
    console.log('SNAPSHOT SAVED:', saved.path, saved.timestamp, saved.generation)
    printSnapshot(saved)
  } catch (error) {
    sessionLog.record('snapshot-unconfirmed',{error:error.message,path:sessionExport})
    console.error('SNAPSHOT NOT CONFIRMED:', error.message, '\nEvery previous generation is retained. Do not assume this session persisted. Inspect:', sessionExport)
    code = 1
  }
  process.exit(code ?? 1)
})

child.on('error', (error) => {
  sessionLog.record('firebase-child-error',{error:error.message})
  console.error('Failed to start the Firebase Emulator Suite:', error.message)
  process.exit(1)
})
