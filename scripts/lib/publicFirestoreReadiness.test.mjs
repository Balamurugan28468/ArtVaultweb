import {describe,it,expect,vi} from 'vitest'
import {waitForPublicFirestore} from './publicFirestoreReadiness.mjs'
describe('public web-SDK readiness',()=>{
 it('requires a successful server probe after offline failure',async()=>{let time=0;const probe=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({fromCache:false,publishedPageSize:1});expect(await waitForPublicFirestore({probe,now:()=>time,pause:async ms=>{time+=ms}})).toEqual({fromCache:false,publishedPageSize:1});expect(probe).toHaveBeenCalledTimes(2)})
 it('fails closed after repeated probe failures',async()=>{let time=0;await expect(waitForPublicFirestore({probe:async()=>{throw Error('offline')},now:()=>time,pause:async ms=>{time+=ms},timeoutMs:2000})).rejects.toThrow('not ready')})
})
