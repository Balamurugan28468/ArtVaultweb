// Starts the Firebase Local Emulator Suite, automatically importing any
// previously exported state from ./emulator-data (if present) and always
// re-exporting there on a clean exit — so local test data (accounts,
// profiles, etc.) survives across dev sessions instead of resetting every
// time the emulators restart. See docs/DEPLOYMENT.md.
//
// Usage: `npm run emulators` (wraps this so `firebase emulators:start` never
// needs to be typed/remembered with the right import/export flags by hand).

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exportDir = path.join(projectRoot, 'emulator-data')
const exportMetadataFile = path.join(exportDir, 'firebase-export-metadata.json')

const MIN_JAVA_MAJOR_VERSION = 21

// The Firestore Emulator needs a JRE; firebase-tools itself requires 21+.
// Prefer JAVA_HOME if the user has it set (even if their raw system PATH
// still resolves an older `java` first — a very common half-fixed state on
// Windows, where JAVA_HOME points at the right JDK but PATH wasn't
// reordered) — never a hardcoded, machine-specific install path.
function resolveJavaCommand() {
  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const javaBin = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (existsSync(javaBin)) return javaBin
  }
  return 'java'
}

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

const javaCommand = resolveJavaCommand()
const javaMajorVersion = getJavaMajorVersion(javaCommand)

if (javaMajorVersion === null) {
  console.error(
    `Could not detect a Java runtime (tried running "${javaCommand} -version").\n` +
      `The Firestore Emulator requires a Java Runtime Environment, JDK ${MIN_JAVA_MAJOR_VERSION}+.\n` +
      `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" for how to install and configure it.`,
  )
  process.exit(1)
}

if (javaMajorVersion < MIN_JAVA_MAJOR_VERSION) {
  console.error(
    `Detected Java ${javaMajorVersion} (via "${javaCommand}"), but the Firebase Emulator Suite requires ` +
      `Java ${MIN_JAVA_MAJOR_VERSION}+.\n` +
      `This is almost always a PATH ordering issue — an older Java installation resolves before a newer ` +
      `JDK ${MIN_JAVA_MAJOR_VERSION}+ one that's already on this machine.\n` +
      `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" to fix this once, for every future terminal ` +
      `session — not just this one.`,
  )
  process.exit(1)
}

console.log(`Using Java ${javaMajorVersion} (via "${javaCommand}").`)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findExportStagingDirs() {
  return readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^firebase-export-\d+/.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(projectRoot, name, 'firebase-export-metadata.json')))
}

// firebase-tools replaces an existing ./emulator-data on export by removing
// it and renaming a freshly-written `firebase-export-<timestamp><random>`
// staging directory into place. Observed on this machine: if anything else
// holds a lock on that path at the exact moment of the rename — most
// commonly `npm run dev`'s own file watcher, running against this same
// project root, which can hold a *sustained* lock for as long as it's
// actively watching, not just a brief blip — that rename fails with EPERM.
// The old directory is already gone by that point, so the data isn't lost,
// but it's left sitting in the staging directory instead of at
// ./emulator-data. Recovers the most recent one with valid export metadata
// among `candidateNames`, retrying briefly in case the lock does clear fast.
async function recoverOrphanedExport(candidateNames, { maxAttempts = 3, label } = {}) {
  const [mostRecent] = candidateNames.sort(
    (a, b) => statSync(path.join(projectRoot, b)).mtimeMs - statSync(path.join(projectRoot, a)).mtimeMs,
  )
  if (!mostRecent) return false

  console.log(
    `\n${label} — found complete, valid export data in ./${mostRecent} that never made it into ` +
      `./emulator-data (a known Windows file-lock race — see docs/DEPLOYMENT.md). Recovering it now...`,
  )

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      renameSync(path.join(projectRoot, mostRecent), exportDir)
      console.log('Recovered — ./emulator-data now holds that data.')
      return true
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(
          `Could not auto-recover it (${error.message}). Your data is safe — it's a complete, valid export ` +
            `sitting in ./${mostRecent}. If a running \`npm run dev\` is the cause (see docs/DEPLOYMENT.md), ` +
            `stopping it and re-running \`npm run emulators\` will recover it automatically; otherwise move/` +
            `rename that folder to ./emulator-data yourself.`,
        )
        return false
      }
      await sleep(300 * attempt)
    }
  }
  return false
}

// Run once up front, before deciding import-vs-fresh below: this recovers
// anything left orphaned by a *previous* run's export (including one whose
// own end-of-run recovery attempt also lost the same race) — and, run here
// before this process's own child has started anything, it's the least
// contested moment to attempt the rename.
await recoverOrphanedExport(findExportStagingDirs(), { maxAttempts: 3, label: 'Startup check' })

// firebase-tools writes firebase-export-metadata.json at the root of every
// successful export — its presence is the reliable signal that
// ./emulator-data holds a real, importable export rather than an empty or
// partially-written directory.
const hasPreviousExport = existsSync(exportMetadataFile)

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

// If JAVA_HOME is set, put its bin/ first in *this child's* PATH — so the
// spawned Firestore Emulator reliably uses the right Java even when the
// user's own raw system PATH still resolves an older one first.
const childEnv = { ...process.env }
if (process.env.JAVA_HOME) {
  const javaBinDir = path.join(process.env.JAVA_HOME, 'bin')
  childEnv.PATH = `${javaBinDir}${path.delimiter}${process.env.PATH ?? ''}`
}

const child = spawn(commandLine, {
  cwd: projectRoot,
  stdio: 'inherit',
  // Required on Windows to resolve `firebase`/`npx` (which are .cmd shims,
  // not directly executable) — also works unchanged on macOS/Linux.
  shell: true,
  env: childEnv,
})

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
  if (!existsSync(exportMetadataFile)) {
    const newStagingDirs = findExportStagingDirs().filter((name) => !preExistingExportStagingDirs.has(name))
    await recoverOrphanedExport(newStagingDirs, { maxAttempts: 3, label: 'Shutdown export' })
  }
  process.exit(signal ? 0 : (code ?? 0))
})

child.on('error', (error) => {
  console.error('Failed to start the Firebase Emulator Suite:', error.message)
  process.exit(1)
})
