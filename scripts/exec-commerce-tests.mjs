// Only invoked inside the existing disposable-emulator launcher.
import { execSync } from 'node:child_process'
execSync('node node_modules/vitest/vitest.mjs run --config vitest.commerce.config.ts', { stdio: 'inherit' })
