import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { loadViewer } from './loadViewer'

const mocks=vi.hoisted(()=>({
  key:Symbol('renderer'), activate:vi.fn(), evict:vi.fn().mockResolvedValue(undefined),
  Viewer:class extends HTMLElement {
    static modelCacheSize=5
    loaded=true
    src='/__ar-proof/model/art/version.glb'
    activateAR(){return mocks.activate(this) as Promise<void>}
  },
}))
vi.mock('@google/model-viewer',()=>({ModelViewerElement:mocks.Viewer}))
vi.mock('@google/model-viewer/lib/model-viewer-base.js',()=>({$renderer:mocks.key}))
vi.mock('@google/model-viewer/lib/three-components/CachingGLTFLoader.js',()=>({CachingGLTFLoader:{delete:mocks.evict}}))
customElements.define('artvault-xr-test',mocks.Viewer)
const vector=()=>({x:1,y:2,z:3,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z}})
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
async function setup(){
  const adapter=await loadViewer()
  const element=document.createElement('artvault-xr-test') as InstanceType<typeof mocks.Viewer>
  document.body.append(element)
  const space={} as XRReferenceSpace
  const transient={cancel:vi.fn()} as unknown as XRTransientInputHitTestSource
  const session=Object.assign(new EventTarget(),{visibilityState:'visible' as XRVisibilityState,requestHitTestSourceForTransientInput:vi.fn().mockResolvedValue(transient),end:vi.fn()})
  const originalFrame=vi.fn((_time:number,_frame:XRFrame)=>{})
  const ar={presentedScene:{element:element as HTMLElement,scenePivot:{position:vector(),quaternion:{set:vi.fn()}}},
    currentSession:null as XRSession|null,placeOnWall:true,overlay:element,
    goalPosition:vector(),goalYaw:0.5,isTranslating:true,isRotating:true,isTwoHandInteraction:true,
    initialHitSource:{cancel:vi.fn()},transientHitTestSource:transient as XRTransientInputHitTestSource|null,
    threeRenderer:{xr:{cameraAutoUpdate:true,setReferenceSpaceType:vi.fn(),setSession:vi.fn().mockResolvedValue(undefined),getReferenceSpace:()=>space}},
    resolveARSession:async()=>session as unknown as XRSession,moveToFloor:vi.fn(),onWebXRFrame:originalFrame,stopPresenting:vi.fn(),
  }
  session.end.mockImplementation(async()=>{session.dispatchEvent(new Event('end'));ar.currentSession=null})
  ar.stopPresenting.mockImplementation(()=>session.end())
  Object.assign(element,{[mocks.key]:{arRenderer:ar}})
  const requestSession=vi.fn().mockResolvedValue(session)
  vi.stubGlobal('navigator',{xr:{requestSession}})
  mocks.activate.mockImplementation(async()=>{ar.currentSession=await ar.resolveARSession()})
  const start=()=>element.activateAR()
  const lock=()=>element.dispatchEvent(new CustomEvent('artvault-lock-position'))
  const unlock=()=>element.dispatchEvent(new CustomEvent('artvault-unlock-position'))
  const frame={getPose:vi.fn()} as unknown as XRFrame
  const tick=(next=frame)=>ar.onWebXRFrame(1,next)
  return {adapter,element,ar,session,start,lock,unlock,frame,tick,originalFrame,requestSession,transient,space}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('XRRigidTransform',class {
  position: DOMPointInit
  orientation: DOMPointInit
  constructor(position:DOMPointInit,orientation:DOMPointInit){this.position=position;this.orientation=orientation}
})})
afterEach(()=>vi.unstubAllGlobals())
describe('working model-viewer WebXR integration',()=>{
 it('requests camera AR only after explicit activation and requires hit testing plus the control overlay',async()=>{const f=await setup();expect(f.requestSession).not.toHaveBeenCalled();await f.start();expect(f.requestSession).toHaveBeenCalledExactlyOnceWith('immersive-ar',expect.objectContaining({requiredFeatures:['hit-test','dom-overlay'],optionalFeatures:expect.arrayContaining(['anchors'])}));expect(f.ar.threeRenderer.xr.setReferenceSpaceType).toHaveBeenCalledWith('local')})
 it('does not fake unsupported device or permission success',async()=>{const f=await setup();f.requestSession.mockRejectedValue(new DOMException('Denied','NotAllowedError'));await expect(f.start()).rejects.toThrow('Denied');expect(f.ar.threeRenderer.xr.setSession).not.toHaveBeenCalled()})
 it('closes the camera if renderer session setup fails',async()=>{const f=await setup();f.ar.threeRenderer.xr.setSession.mockRejectedValue(new Error('graphics failure'));await expect(f.start()).rejects.toThrow('graphics failure');expect(f.session.end).toHaveBeenCalledOnce()})
 it('leaves hit testing and repositioning to the existing engine while unlocked',async()=>{const f=await setup();await f.start();f.tick();expect(f.originalFrame).toHaveBeenCalledOnce();expect(f.ar.transientHitTestSource).toBe(f.transient);expect(f.element.hasAttribute('data-artvault-anchor-lock')).toBe(false)})
 it('locks the actual selected transform locally without optional native anchors',async()=>{const f=await setup();await f.start();f.lock();f.tick();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','local-lock');expect(f.ar.transientHitTestSource).toBeNull();expect(f.ar.isTranslating).toBe(false);expect(f.ar.isRotating).toBe(false);expect(f.ar.isTwoHandInteraction).toBe(false);f.originalFrame.mockImplementation(()=>{f.ar.presentedScene.scenePivot.position.set(9,9,9);f.ar.goalYaw=2});f.tick();expect(f.ar.presentedScene.scenePivot.position).toMatchObject({x:1,y:2,z:3});expect(f.ar.goalYaw).toBe(0.5)})
 it('restores native repositioning on unlock and supports repeated lock cycles',async()=>{const f=await setup();await f.start();f.lock();f.tick();f.unlock();await flush();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','unlocked');expect(f.session.requestHitTestSourceForTransientInput).toHaveBeenCalledOnce();expect(f.ar.transientHitTestSource).toBe(f.transient);f.ar.presentedScene.scenePivot.position.set(4,5,6);f.lock();f.tick();expect(f.ar.goalPosition).toMatchObject({x:4,y:5,z:6})})
 it('uses a real native anchor when available and deletes it on unlock',async()=>{const f=await setup();const anchor={anchorSpace:{},delete:vi.fn()};const frame={getPose:vi.fn(),createAnchor:vi.fn().mockResolvedValue(anchor)} as unknown as XRFrame;await f.start();f.lock();f.tick(frame);await flush();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','anchored');f.unlock();expect(anchor.delete).toHaveBeenCalledOnce()})
 it('holds the last transform on tracking loss and reports recovery only when a pose returns',async()=>{const f=await setup();const anchor={anchorSpace:{},delete:vi.fn()};const pose=vi.fn().mockReturnValue(null);const frame={getPose:pose,createAnchor:vi.fn().mockResolvedValue(anchor)} as unknown as XRFrame;await f.start();f.lock();f.tick(frame);await flush();f.originalFrame.mockImplementation(()=>f.ar.presentedScene.scenePivot.position.set(9,9,9));f.tick(frame);expect(f.element).toHaveAttribute('data-artvault-anchor-lock','lost');expect(f.ar.presentedScene.scenePivot.position).toMatchObject({x:1,y:2,z:3});pose.mockReturnValue({transform:{position:{x:2,y:3,z:4}}});f.tick(frame);expect(f.element).toHaveAttribute('data-artvault-anchor-lock','recovered');expect(f.ar.goalPosition).toMatchObject({x:2,y:3,z:4})})
 it('discards a stale native anchor after unlock and a new lock in the same session',async()=>{const f=await setup();let resolve!:(value:unknown)=>void;const stale={anchorSpace:{},delete:vi.fn()};const frame={getPose:vi.fn(),createAnchor:vi.fn().mockReturnValue(new Promise(r=>{resolve=r}))} as unknown as XRFrame;await f.start();f.lock();f.tick(frame);f.unlock();f.ar.presentedScene.scenePivot.position.set(4,5,6);f.lock();f.tick();resolve(stale);await flush();expect(stale.delete).toHaveBeenCalledOnce();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','local-lock');expect(f.ar.goalPosition).toMatchObject({x:4,y:5,z:6})})
 it('discards pending anchors after session end and resets editing state',async()=>{const f=await setup();let resolve!:(value:unknown)=>void;const anchor={delete:vi.fn()};const frame={createAnchor:vi.fn().mockReturnValue(new Promise(r=>{resolve=r}))} as unknown as XRFrame;await f.start();f.lock();f.tick(frame);await f.session.end();resolve(anchor);await flush();expect(anchor.delete).toHaveBeenCalledOnce();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','unlocked')})
 it('cancels a late transient input source when relocked',async()=>{const f=await setup();let resolve!:(value:unknown)=>void;f.session.requestHitTestSourceForTransientInput.mockReturnValue(new Promise(r=>{resolve=r}));await f.start();f.lock();f.tick();f.unlock();f.lock();f.tick();const source={cancel:vi.fn()};resolve(source);await flush();expect(source.cancel).toHaveBeenCalledOnce();expect(f.ar.transientHitTestSource).toBeNull()})
 it('clears stale gestures on interruption and restores them only when unlocked/visible',async()=>{const f=await setup();await f.start();f.session.visibilityState='hidden';f.session.dispatchEvent(new Event('visibilitychange'));expect(f.ar.transientHitTestSource).toBeNull();expect(f.ar.isTwoHandInteraction).toBe(false);f.session.visibilityState='visible';f.session.dispatchEvent(new Event('visibilitychange'));await flush();expect(f.ar.transientHitTestSource).toBe(f.transient)})
 it('removes event controls and releases only its own session on unmount',async()=>{const f=await setup();await f.start();f.adapter.release(f.element as never);expect(f.ar.stopPresenting).toHaveBeenCalledOnce();expect(f.element.isConnected).toBe(false);f.lock();expect(f.element.getAttribute('data-artvault-anchor-lock')).not.toBe('locking');await expect(f.start()).rejects.toThrow('released')})
 it('ignores controls on an old element when the shared renderer owns a different one',async()=>{const f=await setup();await f.start();f.ar.presentedScene.element=document.createElement('div');f.lock();f.tick();expect(f.transient.cancel).not.toHaveBeenCalled();f.adapter.release(f.element as never);expect(f.ar.stopPresenting).not.toHaveBeenCalled()})
 it('patches once even after repeated load/activation and does not duplicate transient requests',async()=>{const f=await setup();await f.start();await loadViewer();await f.element.activateAR();f.lock();f.tick();f.unlock();await flush();expect(f.session.requestHitTestSourceForTransientInput).toHaveBeenCalledOnce()})
 it('falls back to a local lock when a device rejects optional native anchoring',async()=>{const f=await setup();const frame={createAnchor:vi.fn().mockRejectedValue(new Error('unsupported anchor'))} as unknown as XRFrame;await f.start();f.lock();f.tick(frame);await flush();expect(f.element).toHaveAttribute('data-artvault-anchor-lock','local-lock');expect(f.ar.transientHitTestSource).toBeNull()})
 it('rejects a session that ends while graphics setup is pending',async()=>{const f=await setup();let complete!:()=>void;f.ar.threeRenderer.xr.setSession.mockReturnValue(new Promise<void>(r=>{complete=r}));const starting=f.start();await flush();f.session.dispatchEvent(new Event('end'));complete();await expect(starting).rejects.toThrow('ended during setup');expect(f.session.end).toHaveBeenCalledOnce()})
 it('closes a session whose activation finishes after its element was released',async()=>{const f=await setup();let complete!:()=>void;mocks.activate.mockImplementation(async()=>{await new Promise<void>(r=>{complete=r});f.ar.currentSession=await f.ar.resolveARSession()});const starting=f.start();f.adapter.release(f.element as never);f.ar.stopPresenting.mockClear();complete();await starting;expect(f.ar.stopPresenting).toHaveBeenCalledOnce()})
 it('does not let an old session-end event reset a newer session lock',async()=>{const f=await setup();await f.start();const newer=Object.assign(new EventTarget(),{end:vi.fn().mockResolvedValue(undefined),visibilityState:'visible'});f.requestSession.mockResolvedValue(newer);await f.start();f.lock();f.tick();f.session.dispatchEvent(new Event('end'));expect(f.element).toHaveAttribute('data-artvault-anchor-lock','local-lock');f.tick();expect(f.ar.goalPosition).toMatchObject({x:1,y:2,z:3})})
 it('discards an input source that arrives after the session becomes hidden',async()=>{const f=await setup();let resolve!:(value:unknown)=>void;f.session.requestHitTestSourceForTransientInput.mockReturnValue(new Promise(r=>{resolve=r}));await f.start();f.lock();f.tick();f.unlock();f.session.visibilityState='hidden';f.session.dispatchEvent(new Event('visibilitychange'));const source={cancel:vi.fn()};resolve(source);await flush();expect(source.cancel).toHaveBeenCalledOnce();expect(f.ar.transientHitTestSource).toBeNull()})
})
