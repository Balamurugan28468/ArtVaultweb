import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { env } from '@/config/env'

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
// Module 13 Phase 3 — first client-side use of the Functions SDK, calling
// the three admin callables hardened in Phases 1–2. No region argument:
// functions/src/*.ts sets no region override anywhere (no
// setGlobalOptions), so every callable deploys to the SDK default
// (us-central1), which getFunctions(firebaseApp) already assumes.
export const functions = getFunctions(firebaseApp)

let emulatorsConnected = false

/** Connects the client SDKs to the Local Emulator Suite. Safe to call multiple times. */
export function connectFirebaseEmulators(): void {
  if (emulatorsConnected || !env.VITE_USE_FIREBASE_EMULATORS) return

  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  emulatorsConnected = true
}
