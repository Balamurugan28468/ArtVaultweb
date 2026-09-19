// Read-only readiness of the same anonymous web-SDK query used by marketplace.
// Admin SDK reads alone do not exercise Firestore rules/WebChannel cold startup.
export async function waitForPublicFirestore({ probe = publicProbe, timeoutMs = 90000, now = Date.now, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const started=now()
  let failure
  do {
    try { return await probe() } catch(error) { failure=error }
    await pause(1000)
  } while(now()-started < timeoutMs)
  throw new Error(`Public Firestore read is not ready: ${failure?.message ?? 'timeout'}`)
}
async function publicProbe() {
  const [{initializeApp,deleteApp},sdk]=await Promise.all([import('firebase/app'),import('firebase/firestore')])
  const app=initializeApp({projectId:'demo-artvault',apiKey:'demo-api-key'},'emulator-public-readiness-'+Date.now())
  const db=sdk.getFirestore(app)
  sdk.connectFirestoreEmulator(db,'127.0.0.1',8080)
  let timer
  try {
    const request=sdk.getDocsFromServer(sdk.query(sdk.collection(db,'artworks'),sdk.where('status','==','PUBLISHED'),sdk.orderBy('createdAt','desc'),sdk.orderBy(sdk.documentId(),'desc'),sdk.limit(12)))
    const result=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Public Firestore probe timed out')),20000)})])
    if(result.metadata.fromCache)throw new Error('Offline cache is not readiness')
    return {publishedPageSize:result.size,fromCache:false}
  }finally{clearTimeout(timer);await sdk.terminate(db);await deleteApp(app)}
}
