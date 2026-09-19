import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SNAPSHOT_ROOT } from './emulatorSnapshot.mjs'
import { isLauncherProcess, readLockPid } from './emulatorGuards.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export function readImportProvenance(projectRoot = root, launcherIsAlive = isLauncherProcess) {
  const sessionFile = path.join(projectRoot,SNAPSHOT_ROOT,'session.json')
  if (existsSync(sessionFile)) {
    const session = JSON.parse(readFileSync(sessionFile,'utf8'))
    if (launcherIsAlive(session.pid)) return { importedFrom:session.importedFrom, snapshotTimestamp:session.snapshotTimestamp, generation:session.generation, provenance:'launcher session receipt' }
  }
  const pid = readLockPid(path.join(projectRoot,'.emulator-launcher.lock'))
  const logFile = path.join(projectRoot,'firebase-debug.log')
  if (pid !== null && launcherIsAlive(pid) && existsSync(logFile)) {
    const startup = readFileSync(logFile,'utf8').split('\n').filter(line=>/Command:.* emulators:start /.test(line)).at(-1)
    const match = startup?.match(/--import=(?:"([^"]+)"|(\S+))/)
    if (match) {
      const importedFrom = path.resolve(projectRoot,match[1]??match[2])
      if (importedFrom.startsWith(projectRoot+path.sep)) {
        const metadata = path.join(importedFrom,'firebase-export-metadata.json')
        if (existsSync(metadata)) return { importedFrom, snapshotTimestamp:statSync(metadata).mtime.toISOString(), generation:null, provenance:'legacy startup log; no session receipt was recorded' }
      }
    }
  }
  return { importedFrom:'UNKNOWN: no verifiable startup receipt/log', snapshotTimestamp:null, generation:null, provenance:'unknown' }
}
/** Explicit emulator addresses and demo project: never falls through to production. */
export async function readLiveState({ fingerprint = false } = {}) {
  const hubResponse = await fetch('http://127.0.0.1:4400/emulators', { signal: AbortSignal.timeout(5000) })
  if (!hubResponse.ok) throw new Error('Local emulator hub unavailable')
  const hub = await hubResponse.json()
  for (const [name,port] of Object.entries({ auth:9099, firestore:8080, storage:9199 })) {
    if (hub[name]?.port !== port || !['127.0.0.1','localhost','::1'].includes(hub[name]?.host)) throw new Error(`Expected local ${name} emulator is unavailable`)
  }
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199'
  const require = createRequire(path.join(root,'functions/package.json'))
  const { initializeApp, deleteApp } = require('firebase-admin/app')
  const app = initializeApp({ projectId:'demo-artvault', storageBucket:'demo-artvault.appspot.com' }, `read-only-${Date.now()}`)
  const db = require('firebase-admin/firestore').getFirestore(app)
  try {
    const auth = require('firebase-admin/auth').getAuth(app)
    const users = []
    let token
    do { const page = await auth.listUsers(1000,token); users.push(...page.users); token = page.pageToken } while (token)
    const counts = { authUsers:users.length, users:0, sellers:0, artworks:0, published:0, orders:0, reservations:0, activeReservations:0, reservedUnits:0 }
    for (const collection of ['users','sellers','artworks','orders','reservations']) {
      const result = await db.collection(collection).get()
      counts[collection] = result.size
      if (collection === 'artworks') { counts.published = result.docs.filter(doc=>doc.get('status')==='PUBLISHED').length; counts.reservedUnits = result.docs.reduce((sum,doc)=>sum+(doc.get('reservedCount')??0),0) }
      if (collection === 'orders') counts.activeReservations = result.docs.filter(doc=>doc.get('reservationStatus')==='ACTIVE').length
    }
    let digest
    if (fingerprint) {
      const rows = users.map(user=>['auth/'+user.uid,user.toJSON()])
      async function visit(collection) {
        for (const ref of await collection.listDocuments()) {
          const snapshot = await ref.get()
          if (snapshot.exists) rows.push([ref.path,snapshot.data()])
          for (const child of await ref.listCollections()) await visit(child)
        }
      }
      for (const collection of await db.listCollections()) await visit(collection)
      const [objects] = await require('firebase-admin/storage').getStorage(app).bucket().getFiles()
      for (const object of objects) rows.push(['storage/'+object.name,object.metadata])
      function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value }
      digest = createHash('sha256').update(JSON.stringify(canonical(rows.sort((a,b)=>a[0].localeCompare(b[0]))))).digest('hex')
    }
    return { project:'demo-artvault', counts, fingerprint:digest, ...readImportProvenance() }
  } finally { await db.terminate(); await deleteApp(app) }
}
