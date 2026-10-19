import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['functions/tests/*.integration.ts'], fileParallelism: false, maxWorkers: 1, hookTimeout: 30000, testTimeout: 20000 } })
