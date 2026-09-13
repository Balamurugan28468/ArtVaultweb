import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportMtime, isCompleteExport, renameWithRetry, snapshotManifest, writeSnapshotManifest } from './emulatorExport.mjs'

let dirs = []

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'artvault-emulator-export-test-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
})

/** Builds a real, well-formed export directory on disk — the same three files isCompleteExport/snapshotManifest actually read. */
function writeCompleteExport(dir, { authAccounts = '[]' } = {}) {
  mkdirSync(path.join(dir, 'auth_export'), { recursive: true })
  mkdirSync(path.join(dir, 'firestore_export'), { recursive: true })
  writeFileSync(path.join(dir, 'auth_export', 'accounts.json'), authAccounts, 'utf8')
  writeFileSync(path.join(dir, 'firestore_export', 'firestore_export.overall_export_metadata'), 'firestore-metadata-content', 'utf8')
  writeFileSync(
    path.join(dir, 'firebase-export-metadata.json'),
    JSON.stringify({
      version: '14.0.0',
      auth: { path: 'auth_export' },
      firestore: { metadata_file: 'firestore_export/firestore_export.overall_export_metadata' },
    }),
    'utf8',
  )
}

describe('isCompleteExport', () => {
  it('is false for a directory that does not exist', () => {
    expect(isCompleteExport(path.join(tmpdir(), 'artvault-does-not-exist-xyz'))).toBe(false)
  })

  it('is false for an empty directory (no metadata file at all)', () => {
    const dir = makeTempDir()
    expect(isCompleteExport(dir)).toBe(false)
  })

  it('is false when the metadata file is malformed JSON', () => {
    const dir = makeTempDir()
    writeFileSync(path.join(dir, 'firebase-export-metadata.json'), '{not valid json', 'utf8')
    expect(isCompleteExport(dir)).toBe(false)
  })

  it('is false when the metadata references an auth/firestore payload that does not actually exist — a genuinely partial write', () => {
    const dir = makeTempDir()
    writeFileSync(
      path.join(dir, 'firebase-export-metadata.json'),
      JSON.stringify({ auth: { path: 'auth_export' }, firestore: { metadata_file: 'firestore_export/x' } }),
      'utf8',
    )
    expect(isCompleteExport(dir)).toBe(false)
  })

  it('is true for a genuinely complete, well-formed export with no manifest yet', () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    expect(isCompleteExport(dir)).toBe(true)
  })

  it('is true when a snapshot manifest exists and correctly matches the real content', () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    writeSnapshotManifest(dir)
    expect(isCompleteExport(dir)).toBe(true)
  })

  it('is false when a snapshot manifest exists but does not match the real content — tamper/corruption detection', () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    writeSnapshotManifest(dir)
    // Mutate the real Auth payload after the manifest was written — exactly
    // the shape of corruption a partially-overwritten or hand-edited export
    // would produce.
    writeFileSync(path.join(dir, 'auth_export', 'accounts.json'), '[{"localId":"forged"}]', 'utf8')
    expect(isCompleteExport(dir)).toBe(false)
  })

  it('is false when the manifest file itself is malformed JSON', () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    writeFileSync(path.join(dir, 'artvault-snapshot-manifest.json'), '{not valid', 'utf8')
    expect(isCompleteExport(dir)).toBe(false)
  })
})

describe('snapshotManifest', () => {
  it('produces the same generation hash for identical content', () => {
    const dirA = makeTempDir()
    const dirB = makeTempDir()
    writeCompleteExport(dirA)
    writeCompleteExport(dirB)
    expect(snapshotManifest(dirA).generation).toBe(snapshotManifest(dirB).generation)
  })

  it('produces a different generation hash when the Auth payload differs', () => {
    const dirA = makeTempDir()
    const dirB = makeTempDir()
    writeCompleteExport(dirA, { authAccounts: '[]' })
    writeCompleteExport(dirB, { authAccounts: '[{"localId":"alice"}]' })
    expect(snapshotManifest(dirA).generation).not.toBe(snapshotManifest(dirB).generation)
  })
})

describe('writeSnapshotManifest', () => {
  it('writes a real, valid manifest file for a complete export', () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    writeSnapshotManifest(dir)
    const manifestPath = path.join(dir, 'artvault-snapshot-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(manifest.generation).toBe(snapshotManifest(dir).generation)
  })

  it('does nothing (never throws) for an incomplete export', () => {
    const dir = makeTempDir()
    expect(() => writeSnapshotManifest(dir)).not.toThrow()
    expect(existsSync(path.join(dir, 'artvault-snapshot-manifest.json'))).toBe(false)
  })
})

describe('exportMtime', () => {
  it("returns the metadata file's own mtime as a number", () => {
    const dir = makeTempDir()
    writeCompleteExport(dir)
    const mtime = exportMtime(dir)
    expect(typeof mtime).toBe('number')
    expect(mtime).toBeGreaterThan(0)
  })
})

describe('renameWithRetry', () => {
  it('succeeds immediately when nothing is in the way (real filesystem, no injection)', async () => {
    const parent = makeTempDir()
    const from = path.join(parent, 'from')
    const to = path.join(parent, 'to')
    mkdirSync(from)
    await renameWithRetry(from, to)
    expect(existsSync(to)).toBe(true)
    expect(existsSync(from)).toBe(false)
  })

  it('retries a transient failure (e.g. a real Windows EPERM immediately after a handle closes) and succeeds once it clears', async () => {
    const rename = vi
      .fn()
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      })
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      })
      .mockImplementationOnce(() => {})
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await renameWithRetry('from', 'to', { maxAttempts: 3, rename, wait })

    expect(result).toBe(true)
    expect(rename).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('throws (never silently gives up) after exhausting every attempt against a permanent failure', async () => {
    const rename = vi.fn(() => {
      throw new Error('ENOENT: no such file or directory')
    })
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(renameWithRetry('missing', 'to', { maxAttempts: 3, rename, wait })).rejects.toThrow('ENOENT')
    expect(rename).toHaveBeenCalledTimes(3)
  })

  it('never retries past maxAttempts even under sustained failure', async () => {
    const rename = vi.fn(() => {
      throw new Error('always fails')
    })
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(renameWithRetry('a', 'b', { maxAttempts: 1, rename, wait })).rejects.toThrow('always fails')
    expect(rename).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })
})
