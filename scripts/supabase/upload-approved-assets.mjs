// Sequential, repeat-safe private Storage import; no overwrite or source deletion.
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {operatorClient} from './operator-client.mjs'
const manifestUrl=new URL('../../supabase/.temp/approved-assets.json',import.meta.url)
const manifest=JSON.parse(readFileSync(manifestUrl,'utf8'))
const storage=operatorClient().storage.from('artwork-images')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const receipt=[]
try {
 for(const image of manifest.images) {
  const bytes=readFileSync(image.blob)
  if(bytes.length!==image.size||hash(bytes)!==image.sha256)throw new Error('Source image checksum mismatch')
  const slash=image.objectPath.lastIndexOf('/'),folder=image.objectPath.slice(0,slash),name=image.objectPath.slice(slash+1)
  const existing=await storage.list(folder,{search:name,limit:100})
  if(existing.error)throw new Error('Storage listing failed')
  if(!existing.data.some(o=>o.name===name)) {
   const upload=await storage.upload(image.objectPath,bytes,{contentType:image.contentType,upsert:false,cacheControl:'3600'})
   if(upload.error)throw new Error('Private image upload failed')
  }
  const check=await storage.download(image.objectPath)
  if(check.error||hash(Buffer.from(await check.data.arrayBuffer()))!==image.sha256)throw new Error('Hosted image checksum mismatch')
  receipt.push({id:image.id,path:image.objectPath,sha256:image.sha256,size:image.size})
  writeFileSync(new URL('../../supabase/.temp/upload-receipt.json',import.meta.url),JSON.stringify({generation:manifest.generation,verified:receipt},null,2))
  console.log(JSON.stringify({verifiedImages:receipt.length,total:manifest.images.length}))
 }
} catch { console.error('Asset migration stopped safely; preserve receipt and inspect the failed step. No source data was changed.');process.exitCode=1 }
