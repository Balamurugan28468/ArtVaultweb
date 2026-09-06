// Shared Java-runtime resolution — extracted from start-emulators.mjs so
// any script that spawns a Firebase emulator (the persistent dev launcher,
// or the disposable isolated test-emulator launcher in
// run-isolated-emulator-tests.mjs) resolves the *same* working JDK 21+ the
// same way, rather than each hand-rolling its own copy of this Windows
// PATH-ordering workaround.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const MIN_JAVA_MAJOR_VERSION = 21

// Deliberately `-version` (single dash), not `--version`: Java 8 and older
// only understand the single-dash form and exit with "Unrecognized option"
// on `--version` — which would make this check fail to report anything
// useful for exactly the old-Java case it exists to catch. All JRE/JDK
// versions, old and new, print their version line to stderr for `-version`.
export function getJavaMajorVersion(javaCommand, { spawn = spawnSync } = {}) {
  // No `shell: true` here: javaCommand may be an absolute path containing
  // spaces (e.g. "C:\Program Files\...\java.exe"), and shell:true combined
  // with a separate args array does not reliably quote that for cmd.exe.
  // java.exe is a real executable, not a .cmd shim, so no shell is needed
  // to invoke it directly.
  const result = spawn(javaCommand, ['-version'], { encoding: 'utf8' })
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

export function javaBinPath(installDir) {
  return path.join(installDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
}

// Common Windows locations JDK installers (Temurin/Adoptium, Oracle, Microsoft
// Build of OpenJDK, Corretto) drop a versioned subdirectory into — scanned
// only as a last-resort fallback, never relied on as the primary mechanism.
export function candidateInstallRoots({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32') return []
  const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files'
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
export function findInstalledJdk21Plus({
  exists = existsSync,
  readdir = readdirSync,
  getVersion = getJavaMajorVersion,
  roots = candidateInstallRoots(),
} = {}) {
  for (const root of roots) {
    if (!exists(root)) continue
    let entries
    try {
      entries = readdir(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const installDir = path.join(root, entry.name)
      const javaBin = javaBinPath(installDir)
      if (!exists(javaBin)) continue
      const version = getVersion(javaBin)
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
// Every real dependency is injectable (defaulting to the real
// fs/child_process/env) so this decision logic can be unit tested without
// depending on what Java happens to actually be installed on the machine
// running the tests — see javaRuntime.test.mjs.
export function resolveJava({
  env = process.env,
  exists = existsSync,
  getVersion = getJavaMajorVersion,
  findInstalled = findInstalledJdk21Plus,
} = {}) {
  const javaHome = env.JAVA_HOME
  if (javaHome) {
    const javaBin = javaBinPath(javaHome)
    if (exists(javaBin)) {
      const version = getVersion(javaBin)
      if (version !== null) return { command: javaBin, version, source: `JAVA_HOME (${javaHome})` }
    }
  }

  const pathVersion = getVersion('java')
  if (pathVersion !== null && pathVersion >= MIN_JAVA_MAJOR_VERSION) {
    return { command: 'java', version: pathVersion, source: 'PATH' }
  }

  const found = findInstalled()
  if (found) return { command: found.command, version: found.version, source: `found at ${found.installDir}` }

  // Nothing 21+ available anywhere we looked — report the PATH java (if any)
  // so the error message is concrete rather than a bare "not found".
  if (pathVersion !== null) return { command: 'java', version: pathVersion, source: 'PATH' }
  return null
}

/**
 * Resolves a working JDK 21+ or exits the process with a clear, actionable
 * error — the same fatal-on-failure behavior start-emulators.mjs and
 * run-isolated-emulator-tests.mjs both need, kept in one place so the error
 * wording (and the docs pointer) can't drift between the two callers.
 */
export function resolveJavaOrExit({ resolve = resolveJava, exit = process.exit, log = console.error } = {}) {
  const resolved = resolve()

  if (resolved === null) {
    log(
      `Could not detect any Java runtime (checked JAVA_HOME, PATH, and common install directories).\n` +
        `The Firestore Emulator requires a Java Runtime Environment, JDK ${MIN_JAVA_MAJOR_VERSION}+.\n` +
        `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" for how to install and configure it.`,
    )
    exit(1)
    return null
  }

  if (resolved.version < MIN_JAVA_MAJOR_VERSION) {
    log(
      `Detected Java ${resolved.version} (via ${resolved.source}), but the Firebase Emulator Suite requires ` +
        `Java ${MIN_JAVA_MAJOR_VERSION}+.\n` +
        `This is almost always a PATH ordering issue — an older Java installation resolves before a newer ` +
        `JDK ${MIN_JAVA_MAJOR_VERSION}+ one that's already on this machine.\n` +
        `See docs/DEPLOYMENT.md → "Permanent Windows Java setup" to fix this once, for every future terminal ` +
        `session — not just this one.`,
    )
    exit(1)
    return null
  }

  return resolved
}

/**
 * The env block a spawned emulator child process should use: identical to
 * the current process's env, except with whichever directory resolveJava()
 * settled on put first on PATH — so the spawned Firebase CLI's own internal
 * `java -version` check (which just shells out to bare `java`, ignoring
 * JAVA_HOME) reliably resolves that exact runtime too, even when the raw
 * system PATH would otherwise resolve an older `java` first. Returns
 * `process.env` unchanged when the resolved command is the bare `java`
 * already found correctly on PATH (source === 'PATH') — there's no
 * different directory to prepend in that case.
 */
export function envWithResolvedJavaOnPath(resolved, { env = process.env } = {}) {
  if (resolved.command === 'java') return env
  const javaBinDir = path.dirname(resolved.command)
  return { ...env, PATH: `${javaBinDir}${path.delimiter}${env.PATH ?? ''}` }
}
