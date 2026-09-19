import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, lstatSync, mkdirSync, openSync, closeSync, fsyncSync } from 'node:fs'
import path from 'node:path'
import { isCompleteExport, renameWithRetry } from './emulatorExport.mjs'
import { logRecords, entitySummary, protobufFields, fieldValue } from './firestoreExport.mjs'

export const SNAPSHOT_ROOT = 'firebase-export-snapshots'
const SEAL = 'artvault-persistence.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Invalid snapshot-relative path')
  const target = path.resolve(root, relative)
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Snapshot path escapes its directory')
  return target
}
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Snapshot symlinks are not supported')
    const relative = prefix + entry.name, full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full, relative + '/') : [{ relative, full }]
  }).sort((a,b) => a.relative.localeCompare(b.relative))
}

/** No writes, imports, SDK calls or repairs. Every service stays in one directory. */
export function inspectSnapshot(dir) {
  if (lstatSync(dir).isSymbolicLink()) throw new Error('Snapshot directory is a symlink')
  const inventory = files(dir) // Reject nested symlinks before opening any payload.
  const metadataFile = path.join(dir, 'firebase-export-metadata.json')
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'))
  if (metadata.firestore?.version !== '1.22.0') throw new Error('Unsupported Firestore export format; inspect before importing')
  const authPath = inside(dir, metadata.auth?.path), firestorePath = inside(dir, metadata.firestore?.path), storagePath = inside(dir, metadata.storage?.path)
  inside(dir, metadata.firestore?.metadata_file)
  if (!isCompleteExport(dir)) throw new Error('Incomplete export or mismatched legacy manifest')
  const auth = JSON.parse(readFileSync(path.join(authPath, 'accounts.json'), 'utf8'))
  JSON.parse(readFileSync(path.join(authPath, 'config.json'), 'utf8'))
  if (!Array.isArray(auth.users) || new Set(auth.users.map(user => user.localId)).size !== auth.users.length) throw new Error('Invalid/duplicate Auth accounts')
  const firestoreFiles = files(firestorePath)
  const documentFiles = firestoreFiles.filter(file => /^output-\d+$/.test(path.basename(file.relative)))
  const kindFiles = firestoreFiles.filter(file => file.relative.endsWith('.export_metadata') && !file.relative.endsWith('.overall_export_metadata'))
  if (!kindFiles.length) throw new Error('Missing Firestore shard metadata')
  const referenced = new Set()
  for (const file of kindFiles) {
    for (const shard of protobufFields(readFileSync(file.full)).filter(entry => entry.field === 2)) {
      const name = fieldValue(protobufFields(shard.value), 2)?.toString()
      const full = inside(path.dirname(file.full), name)
      if (!existsSync(full)) throw new Error('Missing Firestore document shard')
      referenced.add(full)
    }
  }
  if (documentFiles.some(file => !referenced.has(file.full)) || referenced.size !== documentFiles.length) throw new Error('Firestore shard list mismatch')
  const documents = documentFiles.flatMap(file => logRecords(readFileSync(file.full)).map(entitySummary))
  const overallRecords = logRecords(readFileSync(inside(dir, metadata.firestore.metadata_file)))
  if (overallRecords[0]?.toString() !== '3') throw new Error('Unsupported Firestore metadata version')
  const overall = overallRecords.slice(1).flatMap(record => protobufFields(record).filter(entry => entry.field === 1).map(entry => protobufFields(entry.value)))
  const expectedCount = overall.reduce((sum, entry) => sum + Number(fieldValue(entry, 3) ?? 0), 0)
  const expectedKinds = overall.map(entry => inside(firestorePath, fieldValue(entry, 2)?.toString().replaceAll('\\',path.sep)))
  if (expectedCount !== documents.length || expectedKinds.length !== kindFiles.length || kindFiles.some(file => !expectedKinds.includes(file.full))) throw new Error('Firestore overall metadata/document count mismatch')
  const counts = { authUsers: auth.users.length, users: 0, sellers: 0, artworks: 0, published: 0, orders: 0, reservations: 0, activeReservations: 0, reservedUnits: 0 }
  for (const document of documents) {
    if (document.segments.length !== 1) continue
    const collection = document.segments[0].collection
    if (['users','sellers','artworks','orders','reservations'].includes(collection)) counts[collection]++
    if (collection === 'artworks') { if (document.properties.status === 'PUBLISHED') counts.published++; counts.reservedUnits += Number(document.properties.reservedCount ?? 0) }
    if (collection === 'orders' && document.properties.reservationStatus === 'ACTIVE') counts.activeReservations++
  }
  const buckets = JSON.parse(readFileSync(path.join(storagePath, 'buckets.json'), 'utf8'))
  if (!Array.isArray(buckets.buckets)) throw new Error('Invalid Storage metadata')
  const storageMetadata = path.join(storagePath, 'metadata')
  if (existsSync(storageMetadata)) for (const file of files(storageMetadata)) {
    const object = JSON.parse(readFileSync(file.full, 'utf8'))
    const blob = readFileSync(path.join(storagePath, 'blobs', path.basename(file.relative, '.json')))
    if (String(blob.length) !== String(object.size) || object.md5Hash !== createHash('md5').update(blob).digest('base64')) throw new Error('Storage blob missing/corrupt')
  }
  const payload = inventory.filter(file => ![SEAL,'artvault-snapshot-manifest.json'].includes(file.relative)).map(file => ({ path: file.relative, sha256: hash(readFileSync(file.full)) }))
  const generation = hash(JSON.stringify(payload))
  let sealed = false
  if (existsSync(path.join(dir, SEAL))) {
    const seal = JSON.parse(readFileSync(path.join(dir, SEAL), 'utf8'))
    if (seal.schemaVersion !== 2 || seal.generation !== generation || JSON.stringify(seal.files) !== JSON.stringify(payload)) throw new Error('Full snapshot checksum mismatch')
    sealed = true
  }
  return { path: path.resolve(dir), timestamp: statSync(metadataFile).mtime.toISOString(), generation, sealed, counts, files: payload }
}

export function scanSnapshots(root) {
  const candidates = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^(emulator-data(?:\.|$)|emulator-export-|firebase-export-)/.test(entry.name) && entry.name !== SNAPSHOT_ROOT).map(entry => path.join(root, entry.name))
  const store = path.join(root, SNAPSHOT_ROOT)
  if (existsSync(store)) candidates.push(...readdirSync(store, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(store,entry.name)))
  return candidates.map(dir => {
    try {
      const inspected = inspectSnapshot(dir)
      if (!inspected.sealed && (path.dirname(dir) === store || /^firebase-export-/.test(path.basename(dir)))) throw new Error('Unconfirmed export: completion/quiescence not recorded; preserve and review before importing')
      return inspected
    } catch (error) {
      const metadata = path.join(dir, 'firebase-export-metadata.json')
      return { path: dir, invalid: error.message, timestamp: statSync(existsSync(metadata) ? metadata : dir).mtime.toISOString() }
    }
  })
}

export function selectSnapshot(candidates) {
  const valid = candidates.filter(candidate => !candidate.invalid).sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp))
  if (!valid.length) throw new Error('NO VALID PERSISTED SNAPSHOT. Refusing an empty startup; preserve data and investigate.')
  const newest = valid[0]
  if (candidates.some(candidate => candidate.invalid && Date.parse(candidate.timestamp) >= Date.parse(newest.timestamp))) throw new Error('A newer/equal candidate is incomplete or corrupt. Refusing to silently import an older snapshot; inspect the candidate list.')
  if (valid.some(candidate => candidate.timestamp === newest.timestamp && candidate.generation !== newest.generation)) throw new Error('Conflicting snapshot generations share the newest timestamp; operator review required.')
  return newest
}

export function printSnapshot(snapshot) {
  console.log(`Persisted Firebase snapshot:\nAuth users: ${snapshot.counts.authUsers}\nFirestore users: ${snapshot.counts.users}\nSellers: ${snapshot.counts.sellers}\nFirestore artworks: ${snapshot.counts.artworks}\nPublished artworks: ${snapshot.counts.published}\nOrders: ${snapshot.counts.orders}\nActive reservations: ${snapshot.counts.activeReservations}\nSnapshot timestamp: ${snapshot.timestamp}\nImported from: ${snapshot.path}\nGeneration: ${snapshot.generation}`)
  if (!snapshot.sealed) console.warn('WARNING: legacy snapshot; original cross-service capture provenance cannot be independently proven.')
  if (!snapshot.counts.published) console.warn('WARNING: this snapshot has ZERO PUBLISHED artworks. This is not proof of a healthy marketplace.')
}

export function newSnapshotPath(root, purpose) {
  const store = path.join(root, SNAPSHOT_ROOT)
  mkdirSync(store, { recursive: true })
  return path.join(store, `${Date.now()}-${purpose}-${randomUUID()}`)
}

export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx')
  try { writeFileSync(fd, JSON.stringify(value,null,2)+'\n'); fsyncSync(fd) } finally { closeSync(fd) }
  // Failure retains the old pointer and the temporary file; no snapshot is removed.
  await renameWithRetry(temporary, file)
}

export async function publishSnapshot(root, dir) {
  const snapshot = inspectSnapshot(dir)
  if (!snapshot.sealed) writeFileSync(path.join(dir, SEAL), JSON.stringify({ schemaVersion: 2, generation: snapshot.generation, files: snapshot.files },null,2)+'\n', { flag: 'wx' })
  const verified = inspectSnapshot(dir)
  const selected = selectSnapshot(scanSnapshots(root))
  if (selected.generation !== verified.generation) throw new Error('A newer snapshot exists; candidate retained without replacing the current pointer')
  await atomicJson(path.join(root,SNAPSHOT_ROOT,'current.json'), { path: verified.path, generation: verified.generation, timestamp: verified.timestamp })
  return verified
}
