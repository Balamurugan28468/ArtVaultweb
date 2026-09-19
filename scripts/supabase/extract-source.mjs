// Imports a verified snapshot into an isolated *read-only-use* emulator on 18880.
// Never restores the owner's emulator or exports/replaces any source snapshot.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { firebaseCli } from '../lib/firebaseCli.mjs'
import { inspectSnapshot } from '../lib/emulatorSnapshot.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const source = JSON.parse(readFileSync(path.join(root,'supabase/.temp/source-inspection.json'),'utf8')).source
if (inspectSnapshot(source.path).generation !== source.generation) throw new Error('Source generation changed; refusing extraction')
const directory = path.join(root,'supabase/.temp/source-reader')
mkdirSync(directory,{recursive:true})
writeFileSync(path.join(directory,'deny.rules'), "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }")
writeFileSync(path.join(directory,'firebase.json'),JSON.stringify({firestore:{rules:'deny.rules'},emulators:{firestore:{host:'127.0.0.1',port:18880},hub:{host:'127.0.0.1',port:14400},logging:{host:'127.0.0.1',port:14500},ui:{enabled:false},singleProjectMode:true}}))
const command = `"${process.execPath}" "${path.join(root,'scripts/supabase/read-source.mjs')}"`
const child = spawn(process.execPath,[firebaseCli(root),'emulators:exec','--project','demo-artvault','--config',path.join(directory,'firebase.json'),'--only','firestore','--import',source.path,command],
  {cwd:directory,windowsHide:true,stdio:'inherit',env:{...process.env,JAVA_TOOL_OPTIONS:'-Xms128m -Xmx512m'}})
child.on('error',()=>{console.error('Isolated source reader could not start');process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
