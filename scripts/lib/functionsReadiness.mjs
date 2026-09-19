// Read the emulator's registry without starting one worker per callable.
// Authenticated business-action verification is a separate integration test.
export const EXPECTED_CALLABLES = ['approveSellerApplication','rejectSellerApplication','moderateArtwork','suspendArtwork','createCheckoutOrder','setArtworkInventory','expireCheckoutReservations']
export const DISCOVERY_TIMEOUT_SECONDS = 60

export async function checkFunctionsRegistration({ fetcher = fetch } = {}) {
  try {
    const response = await fetcher('http://127.0.0.1:5001/backends', { method:'GET',signal:AbortSignal.timeout(2000) })
    if (!response.ok) throw new Error('Registry unavailable')
    const data = await response.json()
    const triggers = data.backends.flatMap(backend=>backend.functionTriggers??[])
    const missing = EXPECTED_CALLABLES.filter(name=>!triggers.some(trigger=>trigger.entryPoint===name&&trigger.region==='us-central1'&&trigger.httpsTrigger))
    if (!triggers.some(trigger=>trigger.entryPoint==='onUserCreate'&&trigger.eventTrigger)) missing.push('onUserCreate')
    return { ready:missing.length===0, missing }
  } catch { return { ready:false, missing:[...EXPECTED_CALLABLES,'onUserCreate'] } }
}

export async function waitForFunctionsRegistration({ check = checkFunctionsRegistration, recover, timeoutMs = 150000, now = Date.now, pause = ms=>new Promise(resolve=>setTimeout(resolve,ms)) } = {}) {
  const started = now()
  let recovered = false, result = { ready:false, missing:EXPECTED_CALLABLES }
  while (now()-started < timeoutMs) {
    result = await check()
    if (result.ready) return { ...result, recovered }
    // One bounded watcher reload, only after the normal 60s discovery window.
    // Never kill/restart the hub or any data emulator.
    if (!recovered && recover && now()-started >= 65000) { recovered=true; await recover() }
    await pause(1000)
  }
  throw new Error(`Functions registration failed: ${result.missing.join(', ')}. No application-ready state was declared; data emulators were not stopped.`)
}
