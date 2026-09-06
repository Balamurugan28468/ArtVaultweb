import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  computeOwnedEmulatorPids,
  describeEmulatorProcess,
  findOrphanEmulatorPorts,
  findOrphanEmulatorProcesses,
  isLauncherProcess,
  isProcessAlive,
  looksLikeArtVaultEmulatorProcess,
  parseListeningPidsByPort,
  parseProcessList,
  readLockPid,
  releaseLockIfOwnedBySelf,
  waitForPortsState,
} from './emulatorGuards.mjs'

const PROJECT_ROOT = 'C:\\Users\\owner\\Desktop\\ARTVAULT_WEB\\artvault'

// Shapes real firebase-tools/Firestore/Functions command lines closely
// enough to exercise every rule under test without depending on the real OS.
const FIRESTORE_CMD = `java -jar C:\\Users\\owner\\.cache\\firebase\\emulators\\cloud-firestore-emulator-v1.22.0.jar --host 127.0.0.1 --port 8080 --seed_from_export ${PROJECT_ROOT}\\emulator-data\\firestore_export\\firestore_export.overall_export_metadata`
const FUNCTIONS_WORKER_CMD = `"node" "${PROJECT_ROOT}\\functions\\node_modules\\.bin\\..\\firebase-functions\\lib\\bin\\firebase-functions.js" "${PROJECT_ROOT}\\functions"`
// The hub/CLI node process only ever gets *relative* import/export flags —
// this is the exact real gap: it can never be proven by its own command
// line alone, only via its relationship to a directly-provable child.
const HUB_CMD = 'node C:\\...\\node_modules\\firebase-tools\\lib\\bin\\firebase.js emulators:start --import=./emulator-data --export-on-exit=./emulator-data'
const STORAGE_RULES_RUNTIME_CMD =
  'java -Djava.security.manager=disallow -Duser.language=en -jar C:\\Users\\owner\\.cache\\firebase\\emulators\\cloud-storage-rules-runtime-v1.1.3.jar serve'

describe('isProcessAlive', () => {
  it('is true when the injected kill function does not throw', () => {
    expect(isProcessAlive(1234, () => {})).toBe(true)
  })

  it('is false when the injected kill function throws (no such process)', () => {
    const throwing = () => {
      throw new Error('ESRCH')
    }
    expect(isProcessAlive(1234, throwing)).toBe(false)
  })
})

describe('isLauncherProcess — the PID-reuse fix', () => {
  it('a dead PID is never the launcher (classic stale-lock case)', () => {
    const isAlive = () => false
    const getCommandLine = vi.fn()
    expect(isLauncherProcess(6536, { isAlive, getCommandLine })).toBe(false)
    // Short-circuits before ever needing to check the command line.
    expect(getCommandLine).not.toHaveBeenCalled()
  })

  it('a live PID whose command line matches this launcher script is the launcher', () => {
    const isAlive = () => true
    const getCommandLine = () => 'node scripts/start-emulators.mjs'
    expect(isLauncherProcess(6536, { isAlive, getCommandLine })).toBe(true)
  })

  it('a live PID whose command line belongs to an unrelated, reused-PID process is NOT the launcher (recycled PID)', () => {
    // The exact bug this fixes: PID 6536 is alive again, but it's some
    // other program entirely — Windows recycled the PID after the real
    // launcher exited without releasing its lock.
    const isAlive = () => true
    const getCommandLine = () => 'C:\\Windows\\System32\\some-unrelated-app.exe'
    expect(isLauncherProcess(6536, { isAlive, getCommandLine })).toBe(false)
  })

  it('falls back to the plain liveness check when command-line verification is unavailable (missing process metadata)', () => {
    const isAlive = () => true
    const getCommandLine = () => null
    expect(isLauncherProcess(6536, { isAlive, getCommandLine })).toBe(true)
  })
})

describe('parseListeningPidsByPort', () => {
  it('extracts the LISTENING PID for each requested port from real-shaped netstat output', () => {
    const output = [
      '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       15456',
      '  TCP    127.0.0.1:9099         0.0.0.0:0              LISTENING       9001',
      '  TCP    [::1]:5173             [::]:0                 LISTENING       18076',
      '  TCP    127.0.0.1:54321        127.0.0.1:8080         ESTABLISHED     4444',
    ].join('\r\n')

    const byPort = parseListeningPidsByPort(output, [8080, 9099, 9199])

    expect(byPort.get(8080)).toBe(15456)
    expect(byPort.get(9099)).toBe(9001)
    expect(byPort.has(9199)).toBe(false)
  })
})

describe('looksLikeArtVaultEmulatorProcess', () => {
  it('recognizes the real orphaned Firestore emulator command line for this project', () => {
    expect(looksLikeArtVaultEmulatorProcess(FIRESTORE_CMD, PROJECT_ROOT)).toBe(true)
  })

  it('recognizes the real Functions worker command line for this project', () => {
    expect(looksLikeArtVaultEmulatorProcess(FUNCTIONS_WORKER_CMD, PROJECT_ROOT)).toBe(true)
  })

  it('rejects a process that mentions the project path but is not an emulator (ambiguous evidence)', () => {
    const commandLine = `notepad.exe ${PROJECT_ROOT}\\README.md`
    expect(looksLikeArtVaultEmulatorProcess(commandLine, PROJECT_ROOT)).toBe(false)
  })

  it('rejects an emulator process that belongs to a different project (ambiguous evidence)', () => {
    const commandLine = 'java -jar cloud-firestore-emulator-v1.22.0.jar --port 8080 --seed_from_export C:\\other-project\\emulator-data\\...'
    expect(looksLikeArtVaultEmulatorProcess(commandLine, PROJECT_ROOT)).toBe(false)
  })

  it('rejects the hub process on its own — only a relative import/export flag, no absolute project path at all', () => {
    expect(looksLikeArtVaultEmulatorProcess(HUB_CMD, PROJECT_ROOT)).toBe(false)
  })

  it('treats a missing command line as unidentified, never as ours', () => {
    expect(looksLikeArtVaultEmulatorProcess(null, PROJECT_ROOT)).toBe(false)
  })
})

describe('describeEmulatorProcess', () => {
  it('labels a Functions worker command line', () => {
    expect(describeEmulatorProcess(FUNCTIONS_WORKER_CMD)).toBe('Functions worker')
  })

  it('falls back to a generic label for an unrecognized (but already-verified-owned) command line', () => {
    expect(describeEmulatorProcess('something unrecognized')).toBe('ArtVault emulator process')
  })
})

describe('parseProcessList', () => {
  it('parses tab-separated "pid\\tparentPid\\tname\\tcommandLine" lines from the bulk process listing', () => {
    const output = ['15456\t13916\tjava.exe\t' + FIRESTORE_CMD, '20300\t18176\tnode.exe\t' + FUNCTIONS_WORKER_CMD, 'not a valid line', ''].join(
      '\r\n',
    )

    const byPid = parseProcessList(output)

    expect(byPid.get(15456)).toEqual({ pid: 15456, parentPid: 13916, name: 'java.exe', commandLine: FIRESTORE_CMD })
    expect(byPid.get(20300)).toEqual({ pid: 20300, parentPid: 18176, name: 'node.exe', commandLine: FUNCTIONS_WORKER_CMD })
    expect(byPid.size).toBe(2)
  })

  it('tolerates a missing/unparseable parent PID rather than dropping the row', () => {
    const byPid = parseProcessList(`4242\t\tnode.exe\t${FUNCTIONS_WORKER_CMD}`)
    expect(byPid.get(4242)).toEqual({ pid: 4242, parentPid: null, name: 'node.exe', commandLine: FUNCTIONS_WORKER_CMD })
  })
})

describe('computeOwnedEmulatorPids — the real gap this fixes: dynamic-port and content-less processes', () => {
  it('proves a directly-identifiable process (Firestore) via its own command line alone', () => {
    const listProcesses = () => `15456\t13916\tjava.exe\t${FIRESTORE_CMD}`
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses })
    expect([...owned.keys()]).toEqual([15456])
  })

  it('proves a Functions worker via its own command line regardless of which (unpredictable) port it holds', () => {
    const listProcesses = () => `20300\t18176\tnode.exe\t${FUNCTIONS_WORKER_CMD}`
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses })
    expect([...owned.keys()]).toEqual([20300])
    expect(owned.get(20300).description).toBe('Functions worker')
  })

  it('climbs from a proven child to the hub process — a bare cmd.exe/node.exe wrapper chain, otherwise unprovable on its own', () => {
    // node(wrapper, dead — excluded) -> cmd.exe -> node.exe(hub, relative
    // flags only) -> java.exe(Firestore, provable). The hub is exactly the
    // real gap: its own command line never contains an absolute path.
    const output = [
      '13872\t15336\tcmd.exe\tcmd /c npx firebase-tools emulators:start --import=./emulator-data',
      `13916\t13872\tnode.exe\t${HUB_CMD}`,
      `13676\t13916\tjava.exe\t${FIRESTORE_CMD}`,
    ].join('\n')

    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => output })

    expect(new Set(owned.keys())).toEqual(new Set([13676, 13916, 13872]))
  })

  it('sweeps down from a climbed-to hub to also catch a content-less sibling (the real Storage rules-runtime case)', () => {
    // Storage's rules-runtime helper has NO project-specific argument at
    // all — the only way to ever prove it is via its parent, the hub,
    // which itself was only reached by climbing up from Firestore.
    const output = [
      `13916\t13872\tnode.exe\t${HUB_CMD}`,
      `13676\t13916\tjava.exe\t${FIRESTORE_CMD}`,
      `7008\t13916\tjava.exe\t${STORAGE_RULES_RUNTIME_CMD}`,
    ].join('\n')

    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => output })

    expect(new Set(owned.keys())).toEqual(new Set([13676, 13916, 7008]))
  })

  it('never climbs past a non-wrapper process name — stops at the real safety boundary', () => {
    // Firestore's parent is reported as bash.exe (never a shape this
    // launcher's own spawn chain could produce) — must not be included,
    // and climbing must stop there rather than continuing further upward.
    const output = [
      '9000\t1\tbash.exe\t/usr/bin/bash -c "some real user terminal session"',
      `13676\t9000\tjava.exe\t${FIRESTORE_CMD}`,
    ].join('\n')

    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => output })

    expect(new Set(owned.keys())).toEqual(new Set([13676]))
    expect(owned.has(9000)).toBe(false)
  })

  it('never climbs beyond the hop limit even through an unbroken chain of wrapper-shaped processes', () => {
    const chain = []
    let parent = null
    // 20 bare cmd.exe/node.exe hops — deliberately far beyond
    // MAX_ANCESTOR_HOPS, standing in for "something unrelated way up the
    // tree that happens to also be cmd.exe/node.exe" (e.g. an IDE's own
    // process host) rather than assuming the climb can run forever.
    for (let i = 0; i < 20; i += 1) {
      const pid = 100 + i
      chain.push(`${pid}\t${parent ?? ''}\t${i % 2 === 0 ? 'cmd.exe' : 'node.exe'}\tunrelated wrapper hop ${i}`)
      parent = pid
    }
    chain.push(`13676\t${parent}\tjava.exe\t${FIRESTORE_CMD}`)

    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => chain.join('\n') })

    expect(owned.has(13676)).toBe(true)
    // Only the seed itself plus up to MAX_ANCESTOR_HOPS ancestors — the far
    // end of the 20-hop chain must never be reached.
    expect(owned.size).toBeLessThanOrEqual(9)
    expect(owned.has(100)).toBe(false)
  })

  it('never classifies an unrelated Node process as owned', () => {
    const listProcesses = () => `4242\t1\tnode.exe\t"node" "C:\\Users\\owner\\some-other-app\\server.js"`
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses })
    expect(owned.size).toBe(0)
  })

  it("never classifies a real Firebase emulator process belonging to a DIFFERENT project as owned", () => {
    const otherProjectCmd = 'java -jar cloud-firestore-emulator-v1.22.0.jar --port 8080 --seed_from_export C:\\other-project\\emulator-data\\...'
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => `9999\t1\tjava.exe\t${otherProjectCmd}` })
    expect(owned.size).toBe(0)
  })

  it('fails safe on ambiguous evidence: project path present but no emulator marker at all', () => {
    const owned = computeOwnedEmulatorPids({
      projectRoot: PROJECT_ROOT,
      listProcesses: () => `5555\t1\tnotepad.exe\tnotepad.exe ${PROJECT_ROOT}\\README.md`,
    })
    expect(owned.size).toBe(0)
  })

  it('fails safe on ambiguous evidence: emulator marker present but no project path at all', () => {
    const owned = computeOwnedEmulatorPids({
      projectRoot: PROJECT_ROOT,
      listProcesses: () => '6666\t1\tjava.exe\tjava -jar cloud-firestore-emulator-v1.22.0.jar --port 8080',
    })
    expect(owned.size).toBe(0)
  })

  it('excludes explicitly-passed PIDs even when their command line would otherwise match (e.g. this launcher’s own current session)', () => {
    const owned = computeOwnedEmulatorPids({
      projectRoot: PROJECT_ROOT,
      excludePids: [20300],
      listProcesses: () => `20300\t1\tnode.exe\t${FUNCTIONS_WORKER_CMD}`,
    })
    expect(owned.size).toBe(0)
  })

  it('never climbs into or through an explicitly-excluded ancestor', () => {
    const output = [`13916\t13872\tnode.exe\t${HUB_CMD}`, `13676\t13916\tjava.exe\t${FIRESTORE_CMD}`].join('\n')
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, excludePids: [13916], listProcesses: () => output })
    // The seed itself is still found directly, but the climb stops at the
    // excluded ancestor instead of including it.
    expect(owned.has(13676)).toBe(true)
    expect(owned.has(13916)).toBe(false)
  })

  it('handles missing/unavailable process metadata (non-Windows, or the listing call itself failed) without throwing', () => {
    const owned = computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => null })
    expect(owned.size).toBe(0)
  })
})

describe('findOrphanEmulatorProcesses — identity-only scan (catches dynamic-port orphans like Functions workers)', () => {
  it('returns the full owned set as a plain list', () => {
    const listProcesses = () => `20300\t1\tnode.exe\t${FUNCTIONS_WORKER_CMD}`
    const result = findOrphanEmulatorProcesses({ projectRoot: PROJECT_ROOT, listProcesses })
    expect(result.owned).toEqual([
      { pid: 20300, name: 'node.exe', commandLine: FUNCTIONS_WORKER_CMD, description: 'Functions worker' },
    ])
  })

  it('finds multiple distinct orphans at once', () => {
    const output = [`15456\t1\tjava.exe\t${FIRESTORE_CMD}`, `20300\t1\tnode.exe\t${FUNCTIONS_WORKER_CMD}`, `4242\t1\tnode.exe\t"node" "unrelated-app.js"`].join(
      '\n',
    )
    const result = findOrphanEmulatorProcesses({ projectRoot: PROJECT_ROOT, listProcesses: () => output })
    expect(result.owned.map((p) => p.pid).sort()).toEqual([15456, 20300])
  })
})

describe('findOrphanEmulatorPorts — port-anchored scan, now tree-aware', () => {
  const ports = { firestore: 8080, auth: 9099, storage: 9199 }

  it('classifies a directly-provable Firestore orphan as owned, and leaves free ports alone', () => {
    const getNetstat = () => '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       15456'
    const computeOwned = () => computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => `15456\t1\tjava.exe\t${FIRESTORE_CMD}` })

    const result = findOrphanEmulatorPorts({ ports, projectRoot: PROJECT_ROOT, getNetstat, computeOwned })

    expect(result.owned).toEqual([{ name: 'firestore', port: 8080, pid: 15456, commandLine: FIRESTORE_CMD }])
    expect(result.unidentified).toEqual([])
  })

  it('the real bug this fixes: the hub process owning Auth/Storage is now classified as owned via its proven Firestore sibling, not left unidentified', () => {
    const netstatOutput = [
      '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       13676',
      '  TCP    127.0.0.1:9099         0.0.0.0:0              LISTENING       13916',
      '  TCP    127.0.0.1:9199         0.0.0.0:0              LISTENING       13916',
    ].join('\r\n')
    const processOutput = [`13916\t13872\tnode.exe\t${HUB_CMD}`, `13676\t13916\tjava.exe\t${FIRESTORE_CMD}`].join('\n')
    const computeOwned = () => computeOwnedEmulatorPids({ projectRoot: PROJECT_ROOT, listProcesses: () => processOutput })

    const result = findOrphanEmulatorPorts({ ports, projectRoot: PROJECT_ROOT, getNetstat: () => netstatOutput, computeOwned })

    expect(result.unidentified).toEqual([])
    expect(result.owned.map((p) => p.name).sort()).toEqual(['auth', 'firestore', 'storage'])
  })

  it('classifies a listener that cannot be proven to be ours as unidentified, never as owned', () => {
    const getNetstat = () => '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       9999'
    const computeOwned = () => new Map()

    const result = findOrphanEmulatorPorts({ ports, projectRoot: PROJECT_ROOT, getNetstat, computeOwned })

    expect(result.owned).toEqual([])
    expect(result.unidentified).toEqual([{ name: 'firestore', port: 8080, pid: 9999, commandLine: null }])
  })

  it('reports nothing when no required port has a listener at all', () => {
    const result = findOrphanEmulatorPorts({ ports, projectRoot: PROJECT_ROOT, getNetstat: () => '', computeOwned: () => new Map() })
    expect(result).toEqual({ owned: [], unidentified: [] })
  })

  it('never throws and reports nothing when the platform check itself is unavailable', () => {
    const result = findOrphanEmulatorPorts({ ports, projectRoot: PROJECT_ROOT, getNetstat: () => null, computeOwned: () => new Map() })
    expect(result).toEqual({ owned: [], unidentified: [] })
  })
})

describe('abnormal previous-launch cleanup — the combined real-world scenario', () => {
  it('a dead lock PID plus a port-bound Firestore/hub orphan plus a dynamic-port Functions-worker orphan are all found and none unidentified', () => {
    // 1. The lock file names a launcher that's no longer running.
    expect(isLauncherProcess(6536, { isAlive: () => false })).toBe(false)

    // 2. The full process tree left behind: hub (relative flags only) +
    //    Firestore (provable) + a Functions worker on its own dynamic port.
    const processOutput = [
      `13916\t13872\tnode.exe\t${HUB_CMD}`,
      `13676\t13916\tjava.exe\t${FIRESTORE_CMD}`,
      `20300\t1\tnode.exe\t${FUNCTIONS_WORKER_CMD}`,
    ].join('\n')
    const netstatOutput = [
      '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       13676',
      '  TCP    127.0.0.1:9099         0.0.0.0:0              LISTENING       13916',
      '  TCP    127.0.0.1:9199         0.0.0.0:0              LISTENING       13916',
    ].join('\r\n')
    const computeOwned = (opts) => computeOwnedEmulatorPids({ ...opts, listProcesses: () => processOutput })

    const portResult = findOrphanEmulatorPorts({
      ports: { firestore: 8080, auth: 9099, storage: 9199 },
      projectRoot: PROJECT_ROOT,
      getNetstat: () => netstatOutput,
      computeOwned,
    })
    expect(portResult.unidentified).toEqual([])

    const identityResult = findOrphanEmulatorProcesses({ projectRoot: PROJECT_ROOT, listProcesses: () => processOutput })

    const allPids = new Set([...portResult.owned.map((p) => p.pid), ...identityResult.owned.map((p) => p.pid)])
    expect([...allPids].sort((a, b) => a - b)).toEqual([13676, 13916, 20300])
  })
})

describe('waitForPortsState — startup readiness', () => {
  const instant = { now: () => 0, delay: () => Promise.resolve() }

  it('reports ok once every required port is listening (full healthy startup)', async () => {
    const probe = async () => true
    const result = await waitForPortsState([8080, 9099, 9199], { want: 'listening', probe, ...instant })
    expect(result).toEqual({ ok: true, missing: [] })
  })

  it('reports the missing port when only Storage never comes up (failed Storage startup)', async () => {
    let tick = 0
    const probe = async (port) => port !== 9199
    const now = () => (tick += 1000)
    const result = await waitForPortsState([8080, 9099, 9199], {
      want: 'listening',
      probe,
      now,
      delay: () => Promise.resolve(),
      timeoutMs: 500,
    })
    expect(result).toEqual({ ok: false, missing: [9199] })
  })

  it('reports every still-missing port on a genuinely partial startup', async () => {
    let tick = 0
    const probe = async (port) => port === 8080
    const now = () => (tick += 1000)
    const result = await waitForPortsState([8080, 9099, 9199], {
      want: 'listening',
      probe,
      now,
      delay: () => Promise.resolve(),
      timeoutMs: 500,
    })
    expect(result.ok).toBe(false)
    expect(result.missing.sort()).toEqual([9099, 9199])
  })

  it('recovers if ports come up on a later poll before the timeout', async () => {
    let calls = 0
    const probe = async () => {
      calls += 1
      return calls > 1 // free/not-listening on the very first poll, listening from the second poll onward
    }
    const result = await waitForPortsState([8080], { want: 'listening', probe, ...instant })
    expect(result.ok).toBe(true)
  })
})

describe('readLockPid (real temp file — no fs mocking needed)', () => {
  it('reads the integer PID recorded in the lock file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'artvault-lock-'))
    const lockFile = path.join(dir, '.emulator-launcher.lock')
    writeFileSync(lockFile, '6536', 'utf8')

    expect(readLockPid(lockFile)).toBe(6536)

    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when no lock file exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'artvault-lock-'))
    expect(readLockPid(path.join(dir, '.emulator-launcher.lock'))).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('lock file release (real temp file — no fs mocking needed)', () => {
  it('releases the lock when it still holds this process’s own PID (graceful shutdown)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'artvault-lock-'))
    const lockFile = path.join(dir, '.emulator-launcher.lock')
    writeFileSync(lockFile, '4242', 'utf8')

    expect(releaseLockIfOwnedBySelf(lockFile, 4242)).toBe(true)
    expect(() => readFileSync(lockFile)).toThrow()

    rmSync(dir, { recursive: true, force: true })
  })

  it("does not release a lock a different (newer) launcher already re-acquired", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'artvault-lock-'))
    const lockFile = path.join(dir, '.emulator-launcher.lock')
    writeFileSync(lockFile, '9999', 'utf8')

    expect(releaseLockIfOwnedBySelf(lockFile, 4242)).toBe(false)
    expect(readFileSync(lockFile, 'utf8')).toBe('9999')

    rmSync(dir, { recursive: true, force: true })
  })

  it('does nothing (and never throws) when the lock file does not exist — lock release after a failure that never wrote one', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'artvault-lock-'))
    const lockFile = path.join(dir, '.emulator-launcher.lock')

    expect(() => releaseLockIfOwnedBySelf(lockFile, 4242)).not.toThrow()
    expect(releaseLockIfOwnedBySelf(lockFile, 4242)).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })
})
