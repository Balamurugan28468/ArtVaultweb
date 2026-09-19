import { existsSync } from 'node:fs'
import path from 'node:path'

// Resolve an already installed CLI; never download one or invoke a Windows shim.
export function firebaseCli(root, env = process.env) {
  const candidates = [path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js')]
  for (const directory of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    candidates.push(path.join(directory, 'node_modules/firebase-tools/lib/bin/firebase.js'))
  }
  const entry = candidates.find(existsSync)
  if (!entry) throw new Error('Installed firebase-tools CLI not found. Install it before starting emulators.')
  return entry
}
