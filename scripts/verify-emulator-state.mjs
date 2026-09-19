// READ ONLY. No compilation, reconciliation, exports, imports, or database writes.
import { readLiveState } from './lib/readEmulatorState.mjs'
try {
  const state = await readLiveState()
  console.log(JSON.stringify(state,null,2))
  if (!state.counts.published) console.warn('WARNING: ZERO PUBLISHED artworks. Do not treat this as a healthy marketplace snapshot.')
} catch (error) {
  console.error('Read-only emulator diagnostic failed:',error.message)
  process.exitCode = 1
}
