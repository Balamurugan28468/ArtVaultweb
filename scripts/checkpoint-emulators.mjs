// Explicit operator checkpoint. Never deletes/overwrites any existing snapshot.
// Firebase exports services sequentially: clients/operators MUST stop writing.
import { spawn } from 'node:child_process'
import { firebaseCli } from './lib/firebaseCli.mjs'
import { openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { newSnapshotPath, publishSnapshot, inspectSnapshot, SNAPSHOT_ROOT } from './lib/emulatorSnapshot.mjs'
import { readLiveState } from './lib/readEmulatorState.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.argv.includes('--quiescent')) {
  console.error('Checkpoint refused. Close application tabs, pause operator/Functions writes, then run npm run checkpoint:emulators -- --quiescent. This confirms the suite is idle; it does not lock database writers.')
  process.exit(1)
}
let lock, target
const lockPath = path.join(root,SNAPSHOT_ROOT,'checkpoint.lock')
try {
  const before = await readLiveState({ fingerprint:true })
  target = newSnapshotPath(root,'checkpoint')
  lock = openSync(lockPath,'wx')
  writeFileSync(lock,String(process.pid))
  const args = [firebaseCli(root),'emulators:export',target,'--project','demo-artvault']
  const code = await new Promise((resolve,reject)=>{
    const child = spawn(process.execPath,args,{cwd:root,stdio:'inherit',shell:false,env:{...process.env,DEBUG:'true'}})
    child.on('error',reject); child.on('close',resolve)
  })
  if (code !== 0) throw new Error(`Firebase export exited ${code}`)
  const exported = inspectSnapshot(target)
  const after = await readLiveState({fingerprint:true})
  if (before.fingerprint !== after.fingerprint || JSON.stringify(exported.counts)!==JSON.stringify(after.counts)) throw new Error('State changed during export or exported counts differ. Candidate retained for investigation, not published.')
  const saved = await publishSnapshot(root,target)
  console.log('SNAPSHOT SAVED:',saved.path,saved.timestamp,saved.generation)
  console.log('All previous generations retained. A crash can still lose changes made after this checkpoint.')
} catch (error) {
  console.error('CHECKPOINT NOT CONFIRMED:',error.message,'Candidate retained at:',target??'(export not started)')
  process.exitCode = 1
} finally {
  if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath) } // coordination lock only
}
