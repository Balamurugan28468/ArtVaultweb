import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { firebaseCli } from './firebaseCli.mjs'
const roots=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function fixture(){const root=mkdtempSync(path.join(os.tmpdir(),'artvault-cli-test-'));roots.push(root);return root}
function install(root){const entry=path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js');mkdirSync(path.dirname(entry),{recursive:true});writeFileSync(entry,'');return entry}
describe('installed Firebase CLI resolution',()=>{
 it('uses a project-local installation',()=>{const root=fixture();const entry=install(root);expect(firebaseCli(root,{PATH:''})).toBe(entry)})
 it('resolves an installed global CLI from PATH, including spaces',()=>{const root=fixture(),global=path.join(root,'global tools');const entry=install(global);expect(firebaseCli(root,{PATH:global})).toBe(entry)})
 it('fails closed when no installed CLI exists',()=>{expect(()=>firebaseCli(fixture(),{PATH:''})).toThrow('not found')})
})
