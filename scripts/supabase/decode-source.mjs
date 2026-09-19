// Read-only EntityProto decoder for the already-validated emulator snapshot.
// Supported meanings: scalar, GD_WHEN (7), ENTITY_PROTO (19), EMPTY_LIST (24).
// Unknown shapes fail closed rather than silently losing nested source data.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { protobufFields, fieldValue, logRecords, entitySummary } from '../lib/firestoreExport.mjs'
import { inspectSnapshot } from '../lib/emulatorSnapshot.mjs'
export function decodeProperties(bytes) {
  const result = Object.create(null)
  for (const entry of protobufFields(bytes).filter(e=>[14,15].includes(e.field))) {
    const property=protobufFields(entry.value), name=fieldValue(property,3)?.toString()
    if (!name || ['__proto__','constructor','prototype'].includes(name)) throw new Error('Invalid source property')
    const meaning=Number(fieldValue(property,1)??0), values=protobufFields(fieldValue(property,5))
    let value=null
    if (meaning===19) value=decodeProperties(fieldValue(values,3))
    else if (meaning===7) value={$timestamp:new Date(Number(fieldValue(values,1)/1000n)).toISOString()}
    else if (meaning===24) { if(values.length) throw new Error('Invalid empty array');value=[] }
    else if (meaning!==0) throw new Error('Unsupported source property meaning')
    else if (fieldValue(values,1)!==undefined) {
      value=Number(BigInt.asIntN(64,fieldValue(values,1)))
      if(!Number.isSafeInteger(value)) throw new Error('Unsafe source integer')
    } else if(fieldValue(values,2)!==undefined) value=Boolean(fieldValue(values,2))
    else if(fieldValue(values,3)!==undefined) value=fieldValue(values,3).toString()
    else if(fieldValue(values,4)!==undefined) value=fieldValue(values,4).readDoubleLE()
    else if(values.length) throw new Error('Unsupported source value')
    if (fieldValue(property,4)===1n && meaning!==24) (result[name]??=[]).push(value)
    else { if(Object.hasOwn(result,name)) throw new Error('Duplicate scalar property');result[name]=value }
  }
  return result
}
export function decodeSource() {
  const root=fileURLToPath(new URL('../../',import.meta.url))
  const source=JSON.parse(readFileSync(path.join(root,'supabase/.temp/source-inspection.json'),'utf8')).source
  const checked=inspectSnapshot(source.path)
  if(checked.generation!==source.generation) throw new Error('Source snapshot changed')
  const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
  const documents=walk(source.path).filter(f=>/^output-\d+$/.test(path.basename(f))).flatMap(f=>logRecords(readFileSync(f))).map(bytes=>({
    path:entitySummary(bytes).segments.map(s=>s.collection+'/'+s.id).join('/'),data:decodeProperties(bytes),
  }))
  writeFileSync(path.join(root,'supabase/.temp/source-decoded.json'),JSON.stringify(documents,null,2))
  return {generation:source.generation,documents}
}
