// Operator-only, read-only extraction from a dedicated, disposable Firestore emulator.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18880') throw new Error('Isolated source reader requires port 18880')
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const app = initializeApp({ projectId: 'demo-artvault' }, 'migration-read-only')
function plain(value) {
  if (value?.toDate instanceof Function) return { $timestamp: value.toDate().toISOString() }
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,plain(v)]))
  return value
}
try {
  const db = getFirestore(app), documents = []
  async function visit(collection) {
    for (const ref of await collection.listDocuments()) {
      const doc = await ref.get()
      if (doc.exists) documents.push({ path: ref.path, data: plain(doc.data()) })
      for (const child of await ref.listCollections()) await visit(child)
    }
  }
  for (const collection of await db.listCollections()) await visit(collection)
  writeFileSync(root + 'supabase/.temp/source-data.json', JSON.stringify(documents, null, 2))
  console.log(JSON.stringify({ sourceDocuments: documents.length, writesToFirebase: 0 }))
} finally { await deleteApp(app) }
