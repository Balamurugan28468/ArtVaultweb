import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readImportProvenance } from './readEmulatorState.mjs'

const roots=[]
function temporary(){const root=mkdtempSync(path.join(tmpdir(),'artvault-provenance-unit-'));roots.push(root);return root}
afterEach(()=>{for(const root of roots)rmSync(root,{recursive:true,force:true});roots.length=0})
it('does not report an obsolete session receipt as the current import',()=>{
  const root=temporary();mkdirSync(path.join(root,'firebase-export-snapshots'))
  writeFileSync(path.join(root,'firebase-export-snapshots/session.json'),JSON.stringify({pid:12,importedFrom:'stale'}))
  expect(readImportProvenance(root,()=>false).provenance).toBe('unknown')
})
it('reports the active launcher receipt without changing it',()=>{
  const root=temporary();mkdirSync(path.join(root,'firebase-export-snapshots'))
  const file=path.join(root,'firebase-export-snapshots/session.json'),receipt=JSON.stringify({pid:12,importedFrom:'same-generation',snapshotTimestamp:'2026-09-18',generation:'hash'})
  writeFileSync(file,receipt)
  expect(readImportProvenance(root,pid=>pid===12)).toMatchObject({importedFrom:'same-generation',snapshotTimestamp:'2026-09-18',generation:'hash'})
  expect(readFileSync(file,'utf8')).toBe(receipt)
})
it('distinguishes legacy log evidence from a recorded session',()=>{
  const root=temporary();mkdirSync(path.join(root,'emulator-data'));writeFileSync(path.join(root,'emulator-data/firebase-export-metadata.json'),'{}')
  writeFileSync(path.join(root,'.emulator-launcher.lock'),'12')
  writeFileSync(path.join(root,'firebase-debug.log'),'[debug] Command: firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data\n[debug] Command: firebase emulators:exec --project demo-artvault-test\n')
  expect(readImportProvenance(root,()=>true)).toMatchObject({importedFrom:path.join(root,'emulator-data'),provenance:'legacy startup log; no session receipt was recorded'})
})
it('does not infer canonical import without startup evidence',()=>expect(readImportProvenance(temporary(),()=>true).provenance).toBe('unknown'))
