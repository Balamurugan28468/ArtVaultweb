// Runs INSIDE `firebase emulators:exec` (see package.json's "test:rules") —
// never invoke this script directly. Kept as its own file (rather than
// inlining the vitest command into package.json's exec argument) so the
// only string `emulators:exec` ever has to parse as its child command is
// this one simple, space-free path — avoiding the kind of nested
// shell-quoting mangling already seen once in this project with a
// multi-word CLI argument on Windows (see functions/src/publishArtwork.ts's
// own npm-run-time argument-escaping history).
import { execSync } from 'node:child_process'

execSync('npx vitest run --config vitest.rules.config.ts', { stdio: 'inherit' })
