// Firestore/Auth emulator export validation and safe-swap primitives,
// shared between scripts/start-emulators.mjs (the normal import-on-start/
// export-on-exit lifecycle) and scripts/checkpoint-emulators.mjs (Module 13
// Phase 4's own live-checkpoint addition, see that file's own header for
// why it exists). Pulled out into their own module — rather than duplicated
// — so both scripts validate/swap an export using the exact same logic,
// never two independently-maintained copies that could quietly drift apart
// on exactly the kind of correctness detail (what counts as "complete",
// what counts as "newer") a durability mechanism can least afford to get
// wrong in two different ways.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function fileHash(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// A single hash over exactly the three files whose *content* determines
// whether one export is meaningfully different from another (not every
// file firebase-tools writes) — cheap enough to compute on every launcher
// start and every checkpoint without adding real I/O cost.
export function snapshotManifest(dirPath) {
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

export function writeSnapshotManifest(dirPath) {
  if (!isCompleteExport(dirPath)) return
  const manifestPath = path.join(dirPath, 'artvault-snapshot-manifest.json')
  const tempPath = `${manifestPath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(snapshotManifest(dirPath), null, 2)}\n`, 'utf8')
  renameSync(tempPath, manifestPath)
}

// A real export directory (either ./emulator-data or a staging/checkpoint
// candidate) must have the top-level metadata file *and* the Auth/Firestore
// payload it claims to have — the metadata file alone can exist for a
// directory firebase-tools (or `firebase emulators:export`) was still in
// the middle of writing when something interrupted it. Never treats a
// partial/corrupt directory as a valid, recoverable snapshot. When a
// snapshot manifest is present, its recorded generation must also match
// what the directory's own content hashes to right now — the same
// tamper/corruption check either caller relies on before ever trusting a
// candidate as "the new known-good".
export function isCompleteExport(dirPath) {
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

// The metadata FILE's own mtime — not its containing directory's mtime — is
// the authoritative "when did this export finish writing" signal. See
// start-emulators.mjs's own longer comment (unchanged) for why directory
// mtime is the wrong signal to compare generations by.
export function exportMtime(dirPath) {
  return statSync(path.join(dirPath, 'firebase-export-metadata.json')).mtimeMs
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Renames `from` to `to`, retrying briefly — Windows can report a transient
// lock (EPERM/EBUSY) for a moment after a process closes its last handle to
// a directory; a short retry window absorbs that without treating it as a
// real failure. Shared verbatim by both callers' own safe-swap sequences.
// `rename`/`wait` are injectable purely so tests can exercise the retry
// loop deterministically against a fake failure, without depending on
// reproducing a real, timing-sensitive OS file lock.
export async function renameWithRetry(from, to, { maxAttempts = 3, rename = renameSync, wait = sleep } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      rename(from, to)
      return true
    } catch (error) {
      if (attempt === maxAttempts) throw error
      await wait(300 * attempt)
    }
  }
  return false
}
