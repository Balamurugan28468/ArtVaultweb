import { it,expect } from 'vitest'
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSessionLog } from './emulatorSessionLog.mjs'
it('retains separate append-only session evidence and signal/exit records',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'artvault-session-log-test-'))
  try {
    const a=createSessionLog(root);a.record('signal',{signal:'SIGINT'});a.record('child-close',{code:0,signal:null})
    const before=readFileSync(a.file,'utf8'),b=createSessionLog(root)
    expect(a.file).not.toBe(b.file);expect(readFileSync(a.file,'utf8')).toBe(before)
    expect(before.trim().split('\n').map(line=>JSON.parse(line).event)).toEqual(['launcher-start','signal','child-close'])
  } finally {rmSync(root,{recursive:true,force:true})}
})
