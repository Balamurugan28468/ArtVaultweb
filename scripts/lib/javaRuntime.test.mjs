import { describe, expect, it, vi } from 'vitest'
import {
  envWithResolvedJavaOnPath,
  findInstalledJdk21Plus,
  getJavaMajorVersion,
  javaBinPath,
  MIN_JAVA_MAJOR_VERSION,
  resolveJava,
  resolveJavaOrExit,
} from './javaRuntime.mjs'

function fakeVersionOutput(stderr, { status = 0 } = {}) {
  return () => ({ status, stderr, stdout: '', error: null })
}

describe('getJavaMajorVersion', () => {
  it('reports the major version directly for Java 9+ ("21.0.12" → 21)', () => {
    const spawn = fakeVersionOutput('openjdk version "21.0.12" 2024-10-15\n')
    expect(getJavaMajorVersion('java', { spawn })).toBe(21)
  })

  it('reports the second component for legacy "1.x" version strings ("1.8.0_503" → 8)', () => {
    const spawn = fakeVersionOutput('java version "1.8.0_503"\n')
    expect(getJavaMajorVersion('java', { spawn })).toBe(8)
  })

  it('returns null when the command errors (e.g. java not found)', () => {
    const spawn = () => ({ status: null, stderr: '', stdout: '', error: new Error('ENOENT') })
    expect(getJavaMajorVersion('java', { spawn })).toBeNull()
  })

  it('returns null when the command exits non-zero', () => {
    const spawn = fakeVersionOutput('', { status: 1 })
    expect(getJavaMajorVersion('java', { spawn })).toBeNull()
  })

  it('returns null when the output has no recognizable version string', () => {
    const spawn = fakeVersionOutput('not a version string')
    expect(getJavaMajorVersion('java', { spawn })).toBeNull()
  })
})

describe('javaBinPath', () => {
  it('joins the install dir with bin/java(.exe)', () => {
    expect(javaBinPath('C:\\jdk-21')).toContain('bin')
    expect(javaBinPath('C:\\jdk-21')).toContain('jdk-21')
  })
})

describe('findInstalledJdk21Plus', () => {
  it('returns the first qualifying JDK found under a candidate root', () => {
    const exists = vi.fn(() => true)
    const readdir = vi.fn(() => [{ name: 'jdk-21.0.1', isDirectory: () => true }])
    const getVersion = vi.fn(() => 21)
    const result = findInstalledJdk21Plus({ exists, readdir, getVersion, roots: ['C:\\Program Files\\Eclipse Adoptium'] })
    expect(result).toEqual(
      expect.objectContaining({ version: 21, installDir: expect.stringContaining('jdk-21.0.1') }),
    )
  })

  it('skips a found JDK below the minimum version and returns null if nothing else qualifies', () => {
    const exists = vi.fn(() => true)
    const readdir = vi.fn(() => [{ name: 'jdk-11', isDirectory: () => true }])
    const getVersion = vi.fn(() => 11)
    const result = findInstalledJdk21Plus({ exists, readdir, getVersion, roots: ['C:\\Program Files\\Java'] })
    expect(result).toBeNull()
  })

  it('returns null when no candidate root exists', () => {
    const exists = vi.fn(() => false)
    const readdir = vi.fn()
    const result = findInstalledJdk21Plus({ exists, readdir, roots: ['C:\\nonexistent'] })
    expect(result).toBeNull()
    expect(readdir).not.toHaveBeenCalled()
  })

  it('skips a root it cannot read rather than throwing', () => {
    const exists = vi.fn(() => true)
    const readdir = vi.fn(() => {
      throw new Error('EPERM')
    })
    expect(() => findInstalledJdk21Plus({ exists, readdir, roots: ['C:\\locked'] })).not.toThrow()
  })
})

describe('resolveJava', () => {
  it('prefers a valid JAVA_HOME over everything else', () => {
    const env = { JAVA_HOME: 'C:\\jdk-21', PATH: '' }
    const exists = () => true
    const getVersion = () => 21
    const result = resolveJava({ env, exists, getVersion })
    expect(result).toEqual(expect.objectContaining({ version: 21, source: expect.stringContaining('JAVA_HOME') }))
  })

  it('falls back to PATH when JAVA_HOME is unset and PATH java is 21+', () => {
    const env = {}
    const exists = () => false
    const getVersion = (cmd) => (cmd === 'java' ? 21 : null)
    const result = resolveJava({ env, exists, getVersion })
    expect(result).toEqual({ command: 'java', version: 21, source: 'PATH' })
  })

  it('ignores an old PATH java and falls back to an installed-JDK scan', () => {
    const env = {}
    const exists = () => false
    const getVersion = (cmd) => (cmd === 'java' ? 8 : null)
    const findInstalled = () => ({ command: 'C:\\jdk-21\\bin\\java.exe', version: 21, installDir: 'C:\\jdk-21' })
    const result = resolveJava({ env, exists, getVersion, findInstalled })
    expect(result).toEqual(expect.objectContaining({ version: 21, source: expect.stringContaining('found at') }))
  })

  it('reports the old PATH java when nothing 21+ is found anywhere (a concrete, actionable error later)', () => {
    const env = {}
    const exists = () => false
    const getVersion = (cmd) => (cmd === 'java' ? 8 : null)
    const findInstalled = () => null
    const result = resolveJava({ env, exists, getVersion, findInstalled })
    expect(result).toEqual({ command: 'java', version: 8, source: 'PATH' })
  })

  it('returns null when no Java is found anywhere', () => {
    const env = {}
    const exists = () => false
    const getVersion = () => null
    const findInstalled = () => null
    expect(resolveJava({ env, exists, getVersion, findInstalled })).toBeNull()
  })

  it('falls through to PATH/scan when JAVA_HOME points at a nonexistent java binary', () => {
    const env = { JAVA_HOME: 'C:\\broken' }
    const exists = () => false
    const getVersion = (cmd) => (cmd === 'java' ? 21 : null)
    const result = resolveJava({ env, exists, getVersion })
    expect(result).toEqual({ command: 'java', version: 21, source: 'PATH' })
  })
})

describe('resolveJavaOrExit', () => {
  it('returns the resolved runtime without exiting when 21+ is found', () => {
    const resolve = () => ({ command: 'java', version: 21, source: 'PATH' })
    const exit = vi.fn()
    const result = resolveJavaOrExit({ resolve, exit, log: vi.fn() })
    expect(result).toEqual({ command: 'java', version: 21, source: 'PATH' })
    expect(exit).not.toHaveBeenCalled()
  })

  it('logs an actionable error and exits(1) when nothing is found', () => {
    const resolve = () => null
    const exit = vi.fn()
    const log = vi.fn()
    resolveJavaOrExit({ resolve, exit, log })
    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`JDK ${MIN_JAVA_MAJOR_VERSION}+`))
  })

  it('logs an actionable error and exits(1) when the resolved Java is below the minimum version', () => {
    const resolve = () => ({ command: 'java', version: 8, source: 'PATH' })
    const exit = vi.fn()
    const log = vi.fn()
    resolveJavaOrExit({ resolve, exit, log })
    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Detected Java 8'))
  })
})

describe('envWithResolvedJavaOnPath', () => {
  it('prepends the resolved java bin directory onto PATH', () => {
    const resolved = { command: 'C:\\jdk-21\\bin\\java.exe', version: 21, source: 'JAVA_HOME (C:\\jdk-21)' }
    const env = { PATH: 'C:\\Windows\\System32' }
    const result = envWithResolvedJavaOnPath(resolved, { env })
    expect(result.PATH.startsWith('C:\\jdk-21\\bin')).toBe(true)
    expect(result.PATH).toContain('C:\\Windows\\System32')
  })

  it('returns the env unchanged when the resolved command is already the bare "java" on PATH', () => {
    const resolved = { command: 'java', version: 21, source: 'PATH' }
    const env = { PATH: 'C:\\Windows\\System32' }
    expect(envWithResolvedJavaOnPath(resolved, { env })).toBe(env)
  })
})
