import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['supabase/functions/**/*.test.ts'], pool: 'threads', maxWorkers: 1, fileParallelism: false } })
