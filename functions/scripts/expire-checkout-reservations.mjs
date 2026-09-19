// Trusted local operator entry point. Fixed emulator only; never production.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequire } from 'node:module'
if (process.argv.length !== 3 || process.argv[2] !== '--demo-artvault-only') throw new Error('Usage: node functions/scripts/expire-checkout-reservations.mjs --demo-artvault-only')
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const db = getFirestore(initializeApp({ projectId: 'demo-artvault' }))
const { expireDueReservations } = createRequire(import.meta.url)('../lib/commerce.js')
expireDueReservations(db).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1 })
