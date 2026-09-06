// Runs INSIDE `firebase emulators:exec` (see package.json's
// "test:storage-rules") — never invoke this script directly. See
// exec-rules-tests.mjs for why this is its own tiny file rather than an
// inline command string.
import { execSync } from 'node:child_process'

execSync('npx vitest run --config vitest.storage-rules.config.ts', { stdio: 'inherit' })
