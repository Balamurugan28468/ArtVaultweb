// Starts the Firebase Local Emulator Suite, automatically importing any
// previously exported state from ./emulator-data (if present) and always
// re-exporting there on a clean exit — so local test data (accounts,
// profiles, etc.) survives across dev sessions instead of resetting every
// time the emulators restart. See docs/DEPLOYMENT.md.
//
// Usage: `npm run emulators` (wraps this so `firebase emulators:start` never
// needs to be typed/remembered with the right import/export flags by hand).

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findOrphanEmulatorPorts,
  findOrphanEmulatorProcesses,
  isLauncherProcess,
  killProcessTree,
  readLockPid,
  releaseLockIfOwnedBySelf,
  waitForPortsState,
} from './lib/emulatorGuards.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportDir = path.join(projectRoot, 'emulator-data')
const exportMetadataFile = path.join(exportDir, 'firebase-export-metadata.json')
const snapshotManifestFile = path.join(exportDir, 'artvault-snapshot-manifest.json')
const backupDir = `${exportDir}.backup`
const lockFile = path.join(projectRoot, '.emulator-launcher.lock')

const MIN_JAVA_MAJOR_VERSION = 21

// firebase.json's own emulator ports — the set this launcher requires to
// actually be listening before it will ever call startup "ready".
const REQUIRED_PORTS = { firestore: 8080, auth: 9099, storage: 9199 }

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
  }
  writeFileSync(lockFile, String(process.pid), 'utf8')
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

  return { owned: [...owned.values()], unidentified: byPort.unidentified, freeablePorts: byPort.owned.map((p) => p.port) }
}

function stopOwnedOrphans(owned) {
  const details = owned.map((p) => `${p.description} (PID ${p.pid})`).join(', ')
  console.log(
    `Found orphaned ArtVault emulator process(es) from a previous session that didn't shut down cleanly: ` +
      `${details}. Stopping them...`,
  )
  for (const { pid } of owned) killProcessTree(pid)
}

// A launcher that was force-killed (rather than shut down via Ctrl+C) can
// leave its emulator child processes running even after its own lock is
// recognized as stale above — nothing else ever stopped them. Starting a
// second `firebase emulators:start` on top of those still-bound ports is
// exactly how a genuinely broken, partial suite happens (observed directly:
// an orphaned Firestore process alone answering on 8080 while Auth/Storage,
// belonging to no running process at all, sit dead — and separately, an
// orphaned Functions worker on its own dynamic port, invisible to a
// port-anchored check entirely). Only ever stops a process independently
// verified (via findAllOwnedOrphans, both strategies) to be this project's
// own emulator suite; anything unidentified occupying a REQUIRED port aborts
// startup loudly instead of guessing — an unidentified process elsewhere
// (not on one of the three fixed ports) is simply left alone, since nothing
// requires that specific port to be free for our own suite to start.
async function cleanUpOrphanedEmulatorProcesses() {
  const { owned, unidentified, freeablePorts } = findAllOwnedOrphans()

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

  stopOwnedOrphans(owned)

  if (freeablePorts.length > 0) {
    const cleared = await waitForPortsState(freeablePorts, { want: 'free', timeoutMs: 10000, intervalMs: 250 })
    if (!cleared.ok) {
      console.error(
        `Stopped the orphaned process(es), but port(s) ${cleared.missing.join(', ')} are still occupied — the OS ` +
          `hasn't released them yet, or something else is now using them. Not safe to start a new suite on top of ` +
          `that. Try again in a moment.`,
      )
      releaseSingleInstanceLock()
      process.exit(1)
    }
  }
  console.log('Orphaned process(es) stopped.')
}

acquireSingleInstanceLock()
process.on('exit', releaseSingleInstanceLock)
await cleanUpOrphanedEmulatorProcesses()

// Deliberately `-version` (single dash), not `--version`: Java 8 and older
// only understand the single-dash form and exit with "Unrecognized option"
// on `--version` — which would make this check fail to report anything
// useful for exactly the old-Java case it exists to catch. All JRE/JDK
// versions, old and new, print their version line to stderr for `-version`.
function getJavaMajorVersion(javaCommand) {
  // No `shell: true` here: javaCommand may be an absolute path containing
  // spaces (e.g. "C:\Program Files\...\java.exe"), and shell:true combined
  // with a separate args array does not reliably quote that for cmd.exe.
  // java.exe is a real executable, not a .cmd shim, so no shell is needed
  // to invoke it directly.
  const result = spawnSync(javaCommand, ['-version'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const match = output.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null

  const [, first, second] = match
  // Legacy "1.8.0_..." version strings (Java 8 and earlier) report their
  // real major version as the second component; Java 9+ reports it directly
  // as the first ("21.0.12" → 21).
  return first === '1' && second ? Number.parseInt(second, 10) : Number.parseInt(first, 10)
}

function javaBinPath(installDir) {
  return path.join(installDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
}

function fileHash(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function snapshotManifest(dirPath) {
  const metadataPath = path.join(dirPath, 'firebase-export-metadata.json')
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const authPath = path.join(dirPath, metadata.auth.path, 'accounts.json')
  const firestoreMetadataPath = path.join(dirPath, metadata.firestore.metadata_file)
  return {
    schemaVersion: 1,
    generation: createHash('sha256')
      .update(`${fileHash(metadataPath)}:${fileHash(authPath)}:${fileHash(firestoreMetadataPath)}`)
      .digest('hex'),
    exportMetadata: fileHash(metadataPath),
    authAccounts: fileHash(authPath),
    firestoreMetadata: fileHash(firestoreMetadataPath),
  }
}

function writeSnapshotManifest(dirPath) {
  if (!isCompleteExport(dirPath)) return
  const manifestPath = path.join(dirPath, 'artvault-snapshot-manifest.json')
  const tempPath = `${manifestPath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(snapshotManifest(dirPath), null, 2)}\n`, 'utf8')
  renameSync(tempPath, manifestPath)
}

// Common Windows locations JDK installers (Temurin/Adoptium, Oracle, Microsoft
// Build of OpenJDK, Corretto) drop a versioned subdirectory into — scanned
// only as a last-resort fallback, never relied on as the primary mechanism.
function candidateInstallRoots() {
  if (process.platform !== 'win32') return []
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  return [
    path.join(programFiles, 'Eclipse Adoptium'),
    path.join(programFiles, 'Java'),
    path.join(programFiles, 'Microsoft'),
    path.join(programFiles, 'Amazon Corretto'),
  ]
}

// Last resort: JAVA_HOME isn't set (or doesn't point at a real JDK) and the
// bare `java` on PATH isn't 21+ — rather than giving up immediately, look
// for an already-installed JDK 21+ the user just hasn't pointed JAVA_HOME
// at yet. Never installs anything; only reports what it finds.
function findInstalledJdk21Plus() {
  for (const root of candidateInstallRoots()) {
    if (!existsSync(root)) continue
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(root, entry.name)
      const javaBin = javaBinPath(installDir)
      if (!existsSync(javaBin)) continue
      const version = getJavaMajorVersion(javaBin)
      if (version !== null && version >= MIN_JAVA_MAJOR_VERSION) {
        return { command: javaBin, version, installDir }
      }
    }
  }
  return null
}

// The Firestore Emulator needs a JRE; firebase-tools itself requires 21+.
// Resolution order: (1) JAVA_HOME, if set and pointing at a real JDK — even
// if the raw system PATH still resolves an older `java` first, a common
// half-fixed state on Windows; (2) bare `java` on PATH, in case it already
// happens to be 21+; (3) a scan of common install directories for an
// already-installed JDK 21+ the user just hasn't wired up via JAVA_HOME or
// PATH yet. Only fails once none of the three produce a qualifying runtime.
function resolveJava() {
  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const javaBin = javaBinPath(javaHome)
    if (existsSync(javaBin)) {
      const version = getJavaMajorVersion(javaBin)
      if (version !== null) return { command: javaBin, version, source: `JAVA_HOME (${javaHome})` }
    }
  }

  const pathVersion = getJavaMajorVersion('java')
  if (pathVersion !== null && pathVersion >= MIN_JAVA_MAJOR_VERSION) {
    return { command: 'java', version: pathVersion, source: 'PATH' }
  }

  const found = findInstalledJdk21Plus()
  if (found) return { command: found.command, version: found.version, source: `found at ${found.installDir}` }

  // Nothing 21+ available anywhere we looked — report the PATH java (if any)
  // so the error message is concrete rather than a bare "not found".
  if (pathVersion !== null) return { command: 'java', version: pathVersion, source: 'PATH' }
  return null
}

const resolved = resolveJava()

if (resolved === null) {
  console.error(
    `Could not detect any Java runtime (checked JAVA_HOME, PATH, and common install directories).\n` +
      `The Firestore Emulator requires a Java Runtime Environment, JDK ${MIN_JAVA_MAJOR_VERSION}+.\n` +
      `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" for how to install and configure it.`,
  )
  process.exit(1)
}

if (resolved.version < MIN_JAVA_MAJOR_VERSION) {
  console.error(
    `Detected Java ${resolved.version} (via ${resolved.source}), but the Firebase Emulator Suite requires ` +
      `Java ${MIN_JAVA_MAJOR_VERSION}+.\n` +
      `This is almost always a PATH ordering issue — an older Java installation resolves before a newer ` +
      `JDK ${MIN_JAVA_MAJOR_VERSION}+ one that's already on this machine.\n` +
      `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" to fix this once, for every future terminal ` +
      `session — not just this one.`,
  )
  process.exit(1)
}

const javaCommand = resolved.command
console.log(`Using Java ${resolved.version} (via ${resolved.source}).`)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A real export directory (either ./emulator-data or a staging
// `firebase-export-*` folder) must have the top-level metadata file *and*
// the Auth/Firestore payload it claims to have — the metadata file alone
// can exist for a directory firebase-tools was still in the middle of
// writing when something interrupted it. Never treats a partial/corrupt
// directory as a valid, recoverable snapshot.
function isCompleteExport(dirPath) {
  const metadataPath = path.join(dirPath, 'firebase-export-metadata.json')
  if (!existsSync(metadataPath)) return false

  let metadata
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  } catch {
    return false
  }

  if (!metadata.auth?.path || !metadata.firestore?.metadata_file) return false
  const accountsFile = path.join(dirPath, metadata.auth.path, 'accounts.json')
  const firestoreMetadataFile = path.join(dirPath, metadata.firestore.metadata_file)
  if (!existsSync(accountsFile) || !existsSync(firestoreMetadataFile)) return false

  const manifestPath = path.join(dirPath, 'artvault-snapshot-manifest.json')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const expected = snapshotManifest(dirPath)
      if (
        manifest.schemaVersion !== expected.schemaVersion ||
        manifest.generation !== expected.generation ||
        manifest.exportMetadata !== expected.exportMetadata ||
        manifest.authAccounts !== expected.authAccounts ||
        manifest.firestoreMetadata !== expected.firestoreMetadata
      ) {
        return false
      }
    } catch {
      return false
    }
  }
  return true
}

function findExportStagingDirs() {
  return readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^firebase-export-\d+/.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => isCompleteExport(path.join(projectRoot, name)))
}

// Renames `from` to `to`, retrying briefly — used both for moving a
// recovered export into place and for moving the current ./emulator-data
// aside first. Windows can report a transient lock (EPERM/EBUSY) for a
// moment after a process closes its last handle to a directory; a short
// retry window absorbs that without treating it as a real failure.
async function renameWithRetry(from, to, { maxAttempts = 3 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      renameSync(from, to)
      return true
    } catch (error) {
      if (attempt === maxAttempts) throw error
      await sleep(300 * attempt)
    }
  }
  return false
}

// firebase-tools replaces an existing ./emulator-data on export by removing
// it and renaming a freshly-written `firebase-export-<timestamp><random>`
// staging directory into place. Observed on this machine: if anything else
// holds a lock on that path at the exact moment of the rename — the actual,
// *proven* cause: Vite's dev-server file watcher held an open handle on
// ./emulator-data for as long as `npm run dev` was running, confirmed by
// directly testing that a rename of ./emulator-data fails while the dev
// server is up and succeeds the instant it's stopped (see vite.config.ts's
// `server.watch.ignored`, which now excludes this directory so this should
// no longer happen under normal operation) — firebase-tools' own removal of
// the old directory fails with EPERM, and the freshly-written export is
// left sitting in the staging directory instead of at ./emulator-data.
//
// Recovers the most recent *validated-complete* export among
// `candidateNames` using a safe swap rather than a raw rename-into-place:
// if ./emulator-data already holds a (still valid) previous export, that
// existing directory is moved aside to a single rolling backup slot
// (./emulator-data.backup, overwriting any previous backup) *before* the
// recovered export is moved into ./emulator-data — so a failure partway
// through this sequence can never leave *no* valid export in either
// location, and the last known-good snapshot is never deleted before the
// new one has actually landed successfully.
// The metadata FILE's own mtime — not its containing directory's mtime — is
// the authoritative "when did firebase-tools finish writing this export"
// signal. Directory mtime only reflects when an entry was last added to that
// directory, which is normally close to the same moment for an export
// firebase-tools wrote in place, but diverges if the directory was ever
// moved/copied afterward (e.g. a manually restored backup folder): the
// containing directory gets a fresh mtime from that move/copy while the file
// inside it keeps its original timestamp. Comparing the file's mtime avoids
// ever mistaking an old restored export for the newest one on that basis.
function exportMtime(dirPath) {
  return statSync(path.join(dirPath, 'firebase-export-metadata.json')).mtimeMs
}

async function recoverOrphanedExport(candidateNames, { label } = {}) {
  const validCandidates = candidateNames.filter((name) => isCompleteExport(path.join(projectRoot, name)))
  const [mostRecent] = validCandidates.sort(
    (a, b) => exportMtime(path.join(projectRoot, b)) - exportMtime(path.join(projectRoot, a)),
  )
  if (!mostRecent) return false

  // Never prefer a recovered stranded export over an already-good
  // ./emulator-data unless the stranded one is genuinely newer — a real bug
  // caught during this fix's own verification: recovering *any* valid
  // staging directory unconditionally once overwrote a fresh export with a
  // days-old stranded one that happened to still be sitting around from an
  // earlier, unrelated failed export. A valid, current ./emulator-data is
  // always at least as trustworthy as a candidate that isn't newer than it.
  if (existsSync(exportDir) && isCompleteExport(exportDir)) {
    const currentMtime = exportMtime(exportDir)
    const candidateMtime = exportMtime(path.join(projectRoot, mostRecent))
    if (candidateMtime <= currentMtime) return false
  }

  console.log(
    `\n${label} — found complete, valid export data in ./${mostRecent} that never made it into ` +
      `./emulator-data (a known Windows file-lock race — see docs/DEPLOYMENT.md). Recovering it now...`,
  )

  try {
    if (existsSync(exportDir)) {
      // Never prefer the recovered export over the current one without
      // checking it's actually valid too — an ./emulator-data that somehow
      // failed validation is not worth preserving as a "known-good" backup,
      // but a valid one always is.
      if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true })
      await renameWithRetry(exportDir, backupDir)
    }
    await renameWithRetry(path.join(projectRoot, mostRecent), exportDir)
    console.log('Recovered — ./emulator-data now holds that data.')
    return true
  } catch (error) {
    console.error(
      `Could not auto-recover it (${error.message}). Your data is safe — it's a complete, valid export sitting ` +
        `in ./${mostRecent}${existsSync(backupDir) ? ` (and the prior ./emulator-data, if any, is preserved at ` +
        `./${path.basename(backupDir)})` : ''}. If a running \`npm run dev\` is the cause (see ` +
        `docs/DEPLOYMENT.md), stopping it and re-running \`npm run emulators\` will recover it automatically; ` +
        `otherwise move/rename that folder to ./emulator-data yourself.`,
    )
    return false
  }
}

// Run once up front, before deciding import-vs-fresh below: this recovers
// anything left orphaned by a *previous* run's export (including one whose
// own end-of-run recovery attempt also lost the same race) — and, run here
// before this process's own child has started anything, it's the least
// contested moment to attempt the rename.
await recoverOrphanedExport(findExportStagingDirs(), { label: 'Startup check' })

// firebase-tools writes firebase-export-metadata.json at the root of every
// successful export — its presence is the reliable signal that
// ./emulator-data holds a real, importable export rather than an empty or
// partially-written directory.
const hasPreviousExport = existsSync(exportMetadataFile)

// Preserve the exact generation this session is about to run from as a
// standing backup *before* anything this session does could ever replace
// it — a plain copy, never a move, so ./emulator-data is untouched. This is
// distinct from recoverOrphanedExport's own use of the same backup slot
// during crash recovery: that only ever runs when something went wrong;
// this runs on every normal startup, so "the last known-good snapshot"
// always exists on disk even if *this* session's own eventual export turns
// out corrupt.
if (hasPreviousExport && isCompleteExport(exportDir)) {
  try {
    rmSync(backupDir, { recursive: true, force: true })
    cpSync(exportDir, backupDir, { recursive: true })
  } catch (error) {
    console.error(`Could not record a startup backup of ./emulator-data (continuing anyway): ${error.message}`)
  }
}

// Snapshot *after* the startup recovery pass above, so the exit-time pass
// below only ever considers directories genuinely created during this run
// (this run's own export-on-exit output) — never re-grabbing something the
// startup pass already intentionally left alone.
const preExistingExportStagingDirs = new Set(findExportStagingDirs())

const localFirebaseBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
)
const useLocalCli = existsSync(localFirebaseBin)

const command = useLocalCli ? localFirebaseBin : 'npx'
const commandArgs = useLocalCli ? [] : ['firebase-tools']

const emulatorArgs = hasPreviousExport
  ? ['emulators:start', '--import=./emulator-data', '--export-on-exit=./emulator-data']
  : ['emulators:start', '--export-on-exit=./emulator-data']

console.log(
  hasPreviousExport
    ? `Found a previous emulator export in ./emulator-data — importing saved data.`
    : `No previous emulator export found in ./emulator-data — starting fresh.`,
)
console.log(`Data will be exported to ./emulator-data on a clean exit (Ctrl+C).\n`)

// Built and passed as one command-line string (not `spawn(cmd, argsArray,
// ...)`) — with `shell: true`, an args array is passed to the shell
// unescaped (Node's DEP0190), which is unnecessary risk for no benefit here
// since every argument below is a fixed, code-controlled flag with no
// spaces or shell metacharacters, never user input.
const commandLine = [command, ...commandArgs, ...emulatorArgs].join(' ')

// Put whichever Java bin/ directory resolveJava() actually settled on first
// in *this child's* PATH — so the spawned Firestore Emulator reliably uses
// that exact runtime too, however it was found (JAVA_HOME, an already-good
// PATH, or the install-directory fallback scan), even when the user's own
// raw system PATH would otherwise resolve an older `java` first. Skipped
// only when the resolved command is the bare `java` already found correctly
// on PATH (source === 'PATH') — there's no different directory to prepend.
const childEnv = { ...process.env }
if (javaCommand !== 'java') {
  const javaBinDir = path.dirname(javaCommand)
  childEnv.PATH = `${javaBinDir}${path.delimiter}${process.env.PATH ?? ''}`
}

const child = spawn(commandLine, {
  cwd: projectRoot,
  stdio: ['inherit', 'pipe', 'pipe'],
  // Required on Windows to resolve `firebase`/`npx` (which are .cmd shims,
  // not directly executable) — also works unchanged on macOS/Linux.
  shell: true,
  env: childEnv,
})

let readinessSeen = false
let reconciliationFinished = false
let reconciliationFailed = false

function forwardOutput(chunk, stream) {
  const text = chunk.toString()
  if (readinessSeen || !text.includes('All emulators ready!')) {
    stream.write(text)
    return
  }

  readinessSeen = true
  const readinessLineEnd = text.indexOf('\n')
  const beforeReadiness = readinessLineEnd === -1 ? text : text.slice(0, readinessLineEnd)
  const afterReadiness = readinessLineEnd === -1 ? '' : text.slice(readinessLineEnd + 1)
  if (beforeReadiness.trim()) stream.write(`${beforeReadiness}\n`)
  void runTrustedReconciliation(afterReadiness, stream)
}

async function runTrustedReconciliation(afterReadiness, stream) {
  const reconcileCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const reconcile = spawn(reconcileCommand, ['run', 'reconcile-roles'], {
    cwd: path.join(projectRoot, 'functions'),
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT ?? 'demo-artvault',
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  reconcile.stdout.on('data', (chunk) => stream.write(chunk))
  reconcile.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const code = await new Promise((resolve) => reconcile.on('close', resolve))
  if (code !== 0) {
    reconciliationFailed = true
    console.error(
      `Trusted role reconciliation failed with exit code ${code}. ` +
        'Do not start the web app; emulator startup is not ready.',
    )
    child.kill('SIGINT')
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
    reconciliationFailed = true
    console.error(
      `Emulator suite reported ready, but required port(s) never came up: ${portsReady.missing.join(', ')}. ` +
        'Treating startup as failed — do not start the web app.',
    )
    child.kill('SIGINT')
    return
  }

  reconciliationFinished = true
  if (afterReadiness) stream.write(afterReadiness)
  console.log('All emulators ready — import complete and trusted role reconciliation completed.')
}

child.stdout.on('data', (chunk) => forwardOutput(chunk, process.stdout))
child.stderr.on('data', (chunk) => forwardOutput(chunk, process.stderr))

// Deliberately do NOT let this wrapper process exit immediately on SIGINT.
// The child (spawned with shell: true, sharing this console session) gets
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
  if (shuttingDown) return
  shuttingDown = true
  console.log('\nStopping — waiting for Firebase to finish exporting to ./emulator-data. Please wait...')
})

child.on('exit', async (code, signal) => {
  // Belt-and-suspenders for a *normal* shutdown: the console Ctrl+C
  // broadcast this relies on (see the SIGINT handler above) should reach
  // every process sharing this console, but a Functions worker surviving
  // past the main child's own exit has been observed in practice. By this
  // point the main child is already gone, so anything still matching our
  // own identity now is unambiguously a straggler, never something still
  // legitimately in use — safe to stop directly, no port-freed wait needed
  // since nothing further depends on these ports being free right now.
  const { owned: stragglers } = findOrphanEmulatorProcesses({ projectRoot, excludePids: [process.pid] })
  if (stragglers.length > 0) {
    stopOwnedOrphans(stragglers)
    console.log(`Stopped ${stragglers.length} emulator process(es) still running after shutdown.`)
  }

  if (!existsSync(exportMetadataFile)) {
    const newStagingDirs = findExportStagingDirs().filter((name) => !preExistingExportStagingDirs.has(name))
    await recoverOrphanedExport(newStagingDirs, { label: 'Shutdown export' })
  }

  // A directory can exist at ./emulator-data with a metadata file yet still
  // be an incomplete/partial write (e.g. the process was killed mid-export)
  // — never treat that as the new canonical snapshot. The startup backup
  // taken above is exactly for this case: fall back to the last known-good
  // generation rather than leaving a broken one in place for the next start.
  if (existsSync(exportMetadataFile) && !isCompleteExport(exportDir)) {
    if (isCompleteExport(backupDir)) {
      console.error(
        "This session's export to ./emulator-data is incomplete/corrupt — restoring the last known-good " +
          'snapshot from ./emulator-data.backup instead of leaving broken data in place.',
      )
      try {
        rmSync(exportDir, { recursive: true, force: true })
        await renameWithRetry(backupDir, exportDir)
      } catch (error) {
        console.error(`Could not restore the backup snapshot: ${error.message}`)
      }
    } else {
      console.error(
        'This export to ./emulator-data is incomplete/corrupt and no valid backup exists to restore — ' +
          'leaving it as-is rather than guessing. See docs/DEPLOYMENT.md.',
      )
    }
    code = code ?? 1
  }

  if (existsSync(exportMetadataFile) && isCompleteExport(exportDir)) {
    try {
      writeSnapshotManifest(exportDir)
      console.log(`Snapshot generation recorded in ./${path.basename(snapshotManifestFile)}.`)
    } catch (error) {
      console.error(`Could not write the snapshot generation manifest: ${error.message}`)
      code = code ?? 1
    }
  }
  if (!reconciliationFinished && !reconciliationFailed && readinessSeen) {
    console.error('Emulator exited before trusted role reconciliation completed.')
    code = code ?? 1
  }
  process.exit(signal ? (reconciliationFailed ? 1 : 0) : (code ?? 0))
})

child.on('error', (error) => {
  console.error('Failed to start the Firebase Emulator Suite:', error.message)
  process.exit(1)
})
