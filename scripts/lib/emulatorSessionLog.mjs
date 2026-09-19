import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { SNAPSHOT_ROOT } from './emulatorSnapshot.mjs'

/** Append-only, per-session evidence, independent of Firebase's disposable log. */
export function createSessionLog(root) {
  const directory=path.join(root,SNAPSHOT_ROOT)
  mkdirSync(directory,{recursive:true})
  const file=path.join(directory,`session-${Date.now()}-${randomUUID()}.jsonl`)
  writeFileSync(file,'',{flag:'wx'})
  const record=(event,details={})=>appendFileSync(file,JSON.stringify({time:new Date().toISOString(),event,...details})+'\n')
  record('launcher-start',{pid:process.pid,parentPid:process.ppid,node:process.version})
  return {file,record}
}
