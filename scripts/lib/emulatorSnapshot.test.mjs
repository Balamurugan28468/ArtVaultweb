import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32c, logRecords, protobufFields } from './firestoreExport.mjs'
import { inspectSnapshot, selectSnapshot, scanSnapshots, publishSnapshot, SNAPSHOT_ROOT } from './emulatorSnapshot.mjs'

const roots=[]
function temporary() { const dir=mkdtempSync(path.join(tmpdir(),'artvault-persistence-unit-'));roots.push(dir);return dir }
afterEach(()=>{for(const dir of roots)rmSync(dir,{recursive:true,force:true});roots.length=0})
const vi = value => { const b=[];let n=BigInt(value);do{b.push(Number(n&127n)|(n>127n?128:0));n>>=7n}while(n);return Buffer.from(b) }
const field = (id,value) => { const b=Buffer.isBuffer(value)?value:Buffer.from(value);return Buffer.concat([vi((id<<3)|2),vi(b.length),b]) }
const int = (id,value) => Buffer.concat([vi(id<<3),vi(value)])
function record(payload,type=1) { const b=Buffer.isBuffer(payload)?payload:Buffer.from(payload);const h=Buffer.alloc(7);const c=crc32c(Buffer.concat([Buffer.from([type]),b]));h.writeUInt32LE((((c>>>15)|(c<<17))+0xa282ead8)>>>0);h.writeUInt16LE(b.length,4);h[6]=type;return Buffer.concat([h,b]) }
function fixture(root,name='emulator-data',status='PUBLISHED') {
  const dir=path.join(root,name), shard='all_namespaces/all_kinds', kind=shard+'/all_namespaces_all_kinds.export_metadata'
  for(const p of ['auth_export','storage_export','firestore_export/'+shard])mkdirSync(path.join(dir,p),{recursive:true})
  writeFileSync(path.join(dir,'firebase-export-metadata.json'),JSON.stringify({auth:{path:'auth_export'},firestore:{version:'1.22.0',path:'firestore_export',metadata_file:'firestore_export/firestore_export.overall_export_metadata'},storage:{path:'storage_export'}}))
  writeFileSync(path.join(dir,'auth_export/accounts.json'),JSON.stringify({users:[{localId:'test-only',customAttributes:'{"role":"SELLER"}'}]}))
  writeFileSync(path.join(dir,'auth_export/config.json'),'{}')
  writeFileSync(path.join(dir,'storage_export/buckets.json'),'{"buckets":[]}')
  const key=Buffer.concat([field(13,'dev~demo-artvault'),field(14,Buffer.concat([Buffer.from([11]),field(2,'artworks'),field(4,'test-only'),Buffer.from([12])]))])
  const entity=Buffer.concat([field(13,key),field(15,Buffer.concat([field(3,'status'),field(5,field(3,status))]))])
  writeFileSync(path.join(dir,'firestore_export/'+shard+'/output-0'),record(entity))
  writeFileSync(path.join(dir,'firestore_export/'+kind),field(2,field(2,'output-0')))
  writeFileSync(path.join(dir,'firestore_export/firestore_export.overall_export_metadata'),Buffer.concat([record('3'),record(field(1,Buffer.concat([field(2,kind),int(3,1)])))]))
  return dir
}
describe('read-only export verification',()=>{
  it('checks CRC32C against the standard vector',()=>expect(crc32c(Buffer.from('123456789'))).toBe(0xe3069283))
  it('reads actual encoded documents and published status without writing a manifest',()=>{
    const dir=fixture(temporary()),summary=inspectSnapshot(dir)
    expect(summary.counts).toMatchObject({authUsers:1,artworks:1,published:1,orders:0})
    expect(existsSync(path.join(dir,'artvault-persistence.json'))).toBe(false)
  })
  it('rejects payload corruption even without a manifest',()=>{
    const dir=fixture(temporary()),f=path.join(dir,'firestore_export/all_namespaces/all_kinds/output-0'),b=readFileSync(f);b[b.length-1]^=1;writeFileSync(f,b)
    expect(()=>inspectSnapshot(dir)).toThrow('checksum')
  })
  it('rejects a missing document shard',()=>{const dir=fixture(temporary());rmSync(path.join(dir,'firestore_export/all_namespaces/all_kinds/output-0'));expect(()=>inspectSnapshot(dir)).toThrow('Missing Firestore document shard')})
  it('rejects truncated protobuf and record fragments',()=>{expect(()=>protobufFields(Buffer.from([10,5,1]))).toThrow('Truncated');expect(()=>logRecords(record('abc',2))).toThrow('Incomplete')})
  it('rejects missing Storage data',()=>{const dir=fixture(temporary());rmSync(path.join(dir,'storage_export/buckets.json'));expect(()=>inspectSnapshot(dir)).toThrow()})
  it('rejects a metadata path escaping the snapshot',()=>{const dir=fixture(temporary()),f=path.join(dir,'firebase-export-metadata.json'),m=JSON.parse(readFileSync(f));m.auth.path='../other';writeFileSync(f,JSON.stringify(m));expect(()=>inspectSnapshot(dir)).toThrow('escapes')})
  it('rejects an unsupported emulator format instead of guessing',()=>{const dir=fixture(temporary()),f=path.join(dir,'firebase-export-metadata.json'),m=JSON.parse(readFileSync(f));m.firestore.version='unknown';writeFileSync(f,JSON.stringify(m));expect(()=>inspectSnapshot(dir)).toThrow('Unsupported')})
})
describe('generation selection and retention',()=>{
  it('selects a newer backup using metadata timestamp, not directory timestamp',()=>{
    const root=temporary(),first=fixture(root),backup=fixture(root,'emulator-data.backup')
    utimesSync(path.join(first,'firebase-export-metadata.json'),1000,1000);utimesSync(path.join(backup,'firebase-export-metadata.json'),2000,2000)
    expect(selectSnapshot(scanSnapshots(root)).path).toBe(backup)
  })
  it('refuses to silently use an older valid snapshot when newer data is incomplete',()=>{
    expect(()=>selectSnapshot([{path:'old',timestamp:'2026-01-01',generation:'a'},{path:'new',timestamp:'2026-02-01',invalid:'incomplete'}])).toThrow('silently')
  })
  it('refuses ambiguous equal-time generations',()=>expect(()=>selectSnapshot([{timestamp:'2026-01-01',generation:'a'},{timestamp:'2026-01-01',generation:'b'}])).toThrow('Conflicting'))
  it('refuses empty startup without any valid snapshot',()=>expect(()=>selectSnapshot([])).toThrow('NO VALID'))
  it('retains an unconfirmed complete export but refuses to auto-import it',()=>{
    const root=temporary();fixture(root,SNAPSHOT_ROOT+'/interrupted')
    expect(scanSnapshots(root)[0].invalid).toContain('Unconfirmed')
    expect(()=>selectSnapshot(scanSnapshots(root))).toThrow('NO VALID')
  })
  it('seals all payloads and replaces only the pointer, retaining every previous generation',async()=>{
    const root=temporary(),old=fixture(root),next=fixture(root,SNAPSHOT_ROOT+'/new')
    utimesSync(path.join(old,'firebase-export-metadata.json'),1000,1000)
    const original=readFileSync(path.join(old,'auth_export/accounts.json'))
    const saved=await publishSnapshot(root,next)
    expect(saved.sealed).toBe(true)
    expect(JSON.parse(readFileSync(path.join(root,SNAPSHOT_ROOT,'current.json'))).path).toBe(next)
    expect(readFileSync(path.join(old,'auth_export/accounts.json'))).toEqual(original)
    expect(existsSync(next)).toBe(true)
    writeFileSync(path.join(next,'auth_export/config.json'),'{"changed":true}')
    expect(()=>inspectSnapshot(next)).toThrow('checksum')
  })
  it('never changes the pointer when a candidate fails validation',async()=>{
    const root=temporary(),valid=fixture(root,SNAPSHOT_ROOT+'/valid');await publishSnapshot(root,valid)
    const pointer=readFileSync(path.join(root,SNAPSHOT_ROOT,'current.json')),bad=fixture(root,SNAPSHOT_ROOT+'/bad')
    rmSync(path.join(bad,'auth_export/accounts.json'))
    await expect(publishSnapshot(root,bad)).rejects.toThrow()
    expect(readFileSync(path.join(root,SNAPSHOT_ROOT,'current.json'))).toEqual(pointer)
    expect(existsSync(bad)).toBe(true)
  })
})
