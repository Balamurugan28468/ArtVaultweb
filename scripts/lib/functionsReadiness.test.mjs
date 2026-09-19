import { describe, expect, it, vi } from 'vitest'
import { checkFunctionsRegistration, EXPECTED_CALLABLES, waitForFunctionsRegistration } from './functionsReadiness.mjs'
describe('Functions registration readiness',()=>{
  it('does not mistake a listening router with missing functions for readiness',async()=>{
    const fetcher=vi.fn(async()=>new Response('Function does not exist',{status:404}))
    expect((await checkFunctionsRegistration({fetcher})).ready).toBe(false)
    expect(fetcher.mock.calls.every(([,options])=>options.method==='GET')).toBe(true)
  })
  it('requires every expected callable in the registered backend',async()=>{
    const fetcher=vi.fn(async()=>Response.json({backends:[{functionTriggers:[...EXPECTED_CALLABLES.filter(name=>name!=='suspendArtwork').map(entryPoint=>({entryPoint,region:'us-central1',httpsTrigger:{}})),{entryPoint:'onUserCreate',eventTrigger:{}}]}]}))
    expect((await checkFunctionsRegistration({fetcher})).missing).toEqual(['suspendArtwork'])
  })
  it('accepts the complete callable set without invoking business actions',async()=>{
    const fetcher=vi.fn(async()=>Response.json({backends:[{functionTriggers:[...EXPECTED_CALLABLES.map(entryPoint=>({entryPoint,region:'us-central1',httpsTrigger:{}})),{entryPoint:'onUserCreate',eventTrigger:{}}]}]}))
    expect(await checkFunctionsRegistration({fetcher})).toEqual({ready:true,missing:[]})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('recovers once, never before the discovery window expires',async()=>{
    let time=0;const recover=vi.fn(),check=vi.fn(async()=>({ready:recover.mock.calls.length===1,missing:['moderateArtwork']}))
    const result=await waitForFunctionsRegistration({check,recover,now:()=>time,pause:async ms=>{time+=ms}})
    expect(time).toBeGreaterThanOrEqual(65000);expect(recover).toHaveBeenCalledTimes(1);expect(result.ready).toBe(true)
  })
  it('fails after a bounded retry instead of declaring broken startup ready',async()=>{
    let time=0;const recover=vi.fn()
    await expect(waitForFunctionsRegistration({check:async()=>({ready:false,missing:['moderateArtwork']}),recover,now:()=>time,pause:async ms=>{time+=ms},timeoutMs:70000})).rejects.toThrow('registration failed')
    expect(recover).toHaveBeenCalledTimes(1)
  })
})
