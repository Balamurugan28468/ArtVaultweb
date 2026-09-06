// Single-instance lock, orphan-process, and port-readiness building blocks
// for scripts/start-emulators.mjs — pulled out into their own module so the
// decision logic (not the actual OS calls) can be unit tested directly. See
// docs/DEPLOYMENT.md for the failure mode this exists to close: a launcher
// that crashed or was force-killed leaves both a stale lock file *and*
// orphaned emulator child processes still bound to the required ports, and
// naively starting a second suite on top of them produces exactly the
// "Firestore alone answers, Auth/Storage never come up" partial state this
// was written to fix, not a real second working emulator suite.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'

// Windows console/process PIDs are recycled quickly — `process.kill(pid, 0)`
// succeeding only proves *some* process currently holds this PID number, not
// that it's the same process that originally wrote the lock file. This alone
// is the plain liveness check every caller used to rely on; isLauncherProcess
// below layers command-line verification on top of it specifically to close
// that gap.
export function isProcessAlive(pid, killFn = process.kill) {
  try {
    killFn(pid, 0)
    return true
  } catch {
    return false
  }
}

// Best-effort and Windows-only (the one platform this project actively
// targets for local dev — see candidateInstallRoots() in
// start-emulators.mjs for the same scoping precedent). Returns null — never
// throws — when the lookup isn't possible at all, so callers can fall back
// to a weaker check rather than block startup over a missing capability.
export function getProcessCommandLine(pid, { spawn = spawnSync } = {}) {
  if (process.platform !== 'win32' || !Number.isInteger(pid)) return null
  const result = spawn(
    'powershell',
    ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
    { encoding: 'utf8' },
  )
  if (result.error || result.status !== 0) return null
  const output = (result.stdout ?? '').trim()
  return output.length > 0 ? output : null
}

// Returns the PID recorded in the lock file, or null if the file is
// missing/unreadable/doesn't contain an integer — callers treat null the
// same as "no lock held" rather than a special error case.
export function readLockPid(lockFile) {
  if (!existsSync(lockFile)) return null
  const pid = Number.parseInt(readFileSync(lockFile, 'utf8').trim(), 10)
  return Number.isInteger(pid) ? pid : null
}

// Only ever removes the lock file when it still names *this* process —
// protects a newer launcher's freshly-reclaimed lock from being deleted out
// from under it by an old process's delayed shutdown/exit handler running
// after the fact. Never throws: lock cleanup must never crash a shutdown.
export function releaseLockIfOwnedBySelf(lockFile, ownPid) {
  try {
    if (existsSync(lockFile) && readFileSync(lockFile, 'utf8').trim() === String(ownPid)) {
      rmSync(lockFile, { force: true })
      return true
    }
  } catch {
    // Never let lock cleanup crash the shutdown path.
  }
  return false
}

// A PID is only trusted as "this is genuinely our own launcher" when it's
// both alive *and* (wherever verifiable) its command line actually names
// this script — not just any live process that happens to have been
// assigned the same PID number since the original launcher exited. Falls
// back to the plain liveness check when command-line verification isn't
// available (non-Windows, or the lookup itself failed) — ownership just
// can't be proven that strongly there, matching this file's existing
// "best effort, never block startup over a missing capability" philosophy.
export function isLauncherProcess(
  pid,
  { marker = 'start-emulators.mjs', isAlive = isProcessAlive, getCommandLine = getProcessCommandLine } = {},
) {
  if (!isAlive(pid)) return false
  const commandLine = getCommandLine(pid)
  if (commandLine === null) return true
  return commandLine.includes(marker)
}

// Parses `netstat -ano` output for the PID currently LISTENING on each of
// the given ports. Pure string-processing, no I/O — kept separate from
// getNetstatOutput() below so it can be unit tested against fixed sample
// output without touching the real OS.
export function parseListeningPidsByPort(netstatOutput, ports) {
  const wanted = new Set(ports)
  const byPort = new Map()
  for (const line of netstatOutput.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S*?:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
    if (!match) continue
    const port = Number.parseInt(match[1], 10)
    const pid = Number.parseInt(match[2], 10)
    if (wanted.has(port)) byPort.set(port, pid)
  }
  return byPort
}

function getNetstatOutput({ spawn = spawnSync } = {}) {
  if (process.platform !== 'win32') return null
  const result = spawn('netstat', ['-ano'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null
  return result.stdout ?? ''
}

// Markers that, combined with a mention of this exact project's own path,
// identify a process as ArtVault's own emulator suite — a bare project-path
// mention alone isn't enough (an unrelated process could reference this
// folder in some other argument), and a bare emulator-keyword match alone
// isn't enough either (it could be a *different* project's Firebase
// emulator on the same machine). Both together are required.
const EMULATOR_MARKERS = [
  'firebase-tools',
  'cloud-firestore-emulator',
  'firebase-functions',
  'emulators:start',
  'firebase-storage-emulator',
]

export function looksLikeArtVaultEmulatorProcess(commandLine, projectRoot) {
  if (!commandLine || !projectRoot) return false
  const mentionsProject = commandLine.toLowerCase().includes(projectRoot.toLowerCase())
  const mentionsEmulator = EMULATOR_MARKERS.some((marker) => commandLine.includes(marker))
  return mentionsProject && mentionsEmulator
}

// Human-readable label only (for log output) — never used for
// classification itself, which is looksLikeArtVaultEmulatorProcess()'s job
// alone. Order matters: checked top to bottom, first match wins.
const PROCESS_KIND_LABELS = [
  ['cloud-firestore-emulator', 'Firestore emulator'],
  ['cloud-storage-rules-runtime', 'Storage rules runtime'],
  ['firebase-storage-emulator', 'Storage emulator'],
  ['firebase-functions', 'Functions worker'],
  ['emulators:start', 'emulator hub/CLI'],
  ['firebase-tools', 'firebase-tools process'],
]

export function describeEmulatorProcess(commandLine) {
  for (const [marker, label] of PROCESS_KIND_LABELS) {
    if (commandLine.includes(marker)) return label
  }
  return 'ArtVault emulator process'
}

// Every process on the system, with enough detail (PID, parent PID, image
// name, full command line) to both identify a process directly by content
// AND walk its place in the process tree. A single PowerShell call for
// every process at once, rather than one call per PID, keeps this cheap
// even on a machine with hundreds of processes running. Returns
// tab-separated "pid\tparentPid\tname\tcommandLine" lines — not parsed here
// (see parseProcessList) so the parsing itself stays unit-testable without
// shelling out. Windows-only, like every process-inspection helper in this
// file; returns null (never throws) where it isn't available at all.
function listAllProcesses({ spawn = spawnSync } = {}) {
  if (process.platform !== 'win32') return null
  const result = spawn(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | ' +
        'ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)" }',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (result.error || result.status !== 0) return null
  return result.stdout ?? ''
}

// Pure parsing, kept separate from the PowerShell call above specifically so
// it can be exercised with fixed sample output in tests.
export function parseProcessList(output) {
  const byPid = new Map()
  for (const line of output.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 4) continue
    const pid = Number.parseInt(parts[0], 10)
    const parentPid = Number.parseInt(parts[1], 10)
    const name = parts[2]
    const commandLine = parts.slice(3).join('\t').trim()
    if (!Number.isInteger(pid) || commandLine.length === 0) continue
    byPid.set(pid, { pid, parentPid: Number.isInteger(parentPid) ? parentPid : null, name, commandLine })
  }
  return byPid
}

// The exact, and only, wrapper-process shapes scripts/start-emulators.mjs's
// own spawn chain can ever produce: `spawn(commandLine, { shell: true })`
// yields a cmd.exe hop, and each of npx/firebase.cmd/npm.cmd's own shims
// yields a further node.exe hop underneath that. Restricting an ownership
// climb to *only* these two names — see climbToOwnedAncestor() below — is
// what makes climbing past a directly-provable process (like Firestore's
// java.exe, whose args include this project's own absolute paths) safe: it
// can only ever also reach this same spawn tree's own intermediate layers,
// never climb into whatever unrelated process happened to start that chain
// in the first place (a user's own terminal, IDE, etc.), which are never
// bare cmd.exe/node.exe hops sitting directly between this launcher and a
// content-provable descendant.
const WRAPPER_PROCESS_NAMES = new Set(['cmd.exe', 'node.exe'])
const MAX_ANCESTOR_HOPS = 8

/**
 * Computes the full set of processes provably belonging to this project's
 * emulator suite, given the complete process list. Two passes:
 *
 * 1. Seed: every process whose *own* command line proves it directly via
 *    looksLikeArtVaultEmulatorProcess() (this project's absolute path AND
 *    an emulator marker, both present) — e.g. Firestore's java.exe
 *    (`--seed_from_export <abs path>`) or a Functions worker
 *    (`...\functions\...\firebase-functions.js "<abs functions dir>"`).
 * 2. Climb: from each seed, walk upward through parent links while every
 *    ancestor is a bare cmd.exe/node.exe wrapper hop (see
 *    WRAPPER_PROCESS_NAMES above) and the hop count stays under
 *    MAX_ANCESTOR_HOPS — closing the real gap a content-only check misses:
 *    the firebase-tools hub process itself only ever receives *relative*
 *    import/export flags (`--import=./emulator-data`), so it can never be
 *    proven by its own command line alone, yet it's the actual owner of the
 *    Auth/Storage ports. Once a wrapper hop is included this way, its
 *    *other* children (e.g. the Storage rules-runtime helper, whose own
 *    command line carries no project-specific argument at all) are included
 *    too, since they share the exact same, now-proven, immediate parent.
 *
 * Never includes anything reached only by a name-only or fuzzy match, never
 * climbs past a non-wrapper process, and never climbs indefinitely — an
 * ambiguous or partially-matching process is left out entirely rather than
 * guessed at.
 */
export function computeOwnedEmulatorPids({ projectRoot, excludePids = [], listProcesses = listAllProcesses }) {
  const output = listProcesses()
  if (output === null) return new Map()

  const byPid = parseProcessList(output)
  const excluded = new Set(excludePids)
  const owned = new Map()

  const include = (proc) => {
    if (owned.has(proc.pid)) return
    owned.set(proc.pid, { pid: proc.pid, name: proc.name, commandLine: proc.commandLine, description: describeEmulatorProcess(proc.commandLine) })
  }

  const seeds = []
  for (const proc of byPid.values()) {
    if (excluded.has(proc.pid)) continue
    if (looksLikeArtVaultEmulatorProcess(proc.commandLine, projectRoot)) {
      include(proc)
      seeds.push(proc)
    }
  }

  for (const seed of seeds) {
    let current = seed
    for (let hop = 0; hop < MAX_ANCESTOR_HOPS && current.parentPid != null; hop += 1) {
      const parent = byPid.get(current.parentPid)
      if (!parent || excluded.has(parent.pid) || !WRAPPER_PROCESS_NAMES.has(parent.name)) break
      include(parent)
      current = parent
    }
  }

  // Sweep back down from every now-owned process (seeds and climbed
  // ancestors alike) to pick up siblings/children with no project-specific
  // argument of their own at all — structurally unidentifiable except by
  // being a child of an already-proven process.
  const childrenByParent = new Map()
  for (const proc of byPid.values()) {
    if (proc.parentPid == null) continue
    if (!childrenByParent.has(proc.parentPid)) childrenByParent.set(proc.parentPid, [])
    childrenByParent.get(proc.parentPid).push(proc)
  }
  const queue = [...owned.keys()]
  while (queue.length > 0) {
    const pid = queue.shift()
    for (const child of childrenByParent.get(pid) ?? []) {
      if (excluded.has(child.pid) || owned.has(child.pid)) continue
      include(child)
      queue.push(child.pid)
    }
  }

  return owned
}

/**
 * Checks each required port for a listener left over from a previous,
 * un-cleanly-terminated launcher, consulting the same tree-aware ownership
 * computation as findOrphanEmulatorProcesses() below (not just a per-PID
 * direct content check) — the firebase-tools hub process itself (which owns
 * the Auth/Storage ports directly) only ever receives relative import/
 * export flags, so a direct-content-only check would wrongly call it
 * unidentified even though it's provably part of the same tree as an
 * already-verified Firestore/Functions process. Returns
 * `{ owned, unidentified }`: `owned` entries are safe to stop; anything in
 * `unidentified` must never be touched — the caller should fail loudly
 * instead of guessing. Returns both empty on a platform where this can't be
 * checked at all (never blocks startup over a missing capability).
 */
export function findOrphanEmulatorPorts({
  ports,
  projectRoot,
  getNetstat = getNetstatOutput,
  computeOwned = computeOwnedEmulatorPids,
}) {
  const netstatOutput = getNetstat()
  if (netstatOutput === null) return { owned: [], unidentified: [] }

  const byPort = parseListeningPidsByPort(netstatOutput, Object.values(ports))
  const ownedPids = computeOwned({ projectRoot })
  const owned = []
  const unidentified = []
  for (const [name, port] of Object.entries(ports)) {
    const pid = byPort.get(port)
    if (pid === undefined) continue
    const ownedEntry = ownedPids.get(pid)
    if (ownedEntry) owned.push({ name, port, pid, commandLine: ownedEntry.commandLine })
    else unidentified.push({ name, port, pid, commandLine: null })
  }
  return { owned, unidentified }
}

/**
 * Identity-based orphan scan across *every* running process, not just ones
 * bound to a fixed port — the only way to ever find a Functions worker (or
 * anything else on a dynamic port) left behind by a previous, un-cleanly-
 * terminated launcher. Thin wrapper around computeOwnedEmulatorPids() (see
 * its own doc comment for exactly what counts as proof) returning a plain
 * list rather than a Map. Never kills anything itself; callers decide what
 * to do with the result. `excludePids` lets a caller exclude its own PID (or
 * a set of PIDs it already knows are legitimate current-session processes)
 * from consideration.
 */
export function findOrphanEmulatorProcesses({ projectRoot, excludePids = [], listProcesses = listAllProcesses }) {
  const owned = computeOwnedEmulatorPids({ projectRoot, excludePids, listProcesses })
  return { owned: [...owned.values()] }
}

// Best-effort. Windows: kills the full process tree (an orphaned emulator
// process may itself have children, e.g. a wrapper shell) via taskkill,
// matching the same tool used elsewhere for verified cleanup. POSIX: kills
// only the process itself — no portable tree-kill primitive exists without
// an extra dependency, a real but documented limitation on that platform.
export function killProcessTree(pid, { spawn = spawnSync, kill = process.kill } = {}) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'])
    return
  }
  try {
    kill(pid, 'SIGKILL')
  } catch {
    // Already gone — nothing to do.
  }
}

// One-shot TCP connect probe — deliberately not netstat-based here (unlike
// the orphan check above) so readiness verification stays portable and
// doesn't depend on shelling out at all.
export function isPortListening(port, { host = '127.0.0.1', timeoutMs = 500 } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const socket = connect({ port, host })
    const finish = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('error', () => finish(false))
    socket.once('connect', () => finish(true))
  })
}

/**
 * Polls `ports` until they all reach the desired state (`'listening'` or
 * `'free'`) or `timeoutMs` elapses. `probe`/`now`/`delay` are injectable
 * purely so tests can simulate partial/slow/instant startup without real
 * sockets or real waiting.
 */
export async function waitForPortsState(
  ports,
  { want = 'listening', timeoutMs = 15000, intervalMs = 500, probe = isPortListening, now = Date.now, delay } = {},
) {
  const wait = delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const deadline = now() + timeoutMs
  for (;;) {
    const results = await Promise.all(ports.map(async (port) => [port, await probe(port)]))
    const missing = results.filter(([, listening]) => (want === 'listening' ? !listening : listening)).map(([port]) => port)
    if (missing.length === 0) return { ok: true, missing: [] }
    if (now() >= deadline) return { ok: false, missing }
    await wait(intervalMs)
  }
}
