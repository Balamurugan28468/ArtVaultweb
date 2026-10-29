import {beforeEach,describe,expect,it,vi} from 'vitest'
import {selectionFixture} from '../testFixtures'
const mock=vi.hoisted(()=>({rpc:vi.fn(),signedImage:vi.fn()}))
vi.mock('@/lib/supabase/data',()=>mock)
import {getSelectionDashboard,generateSelection,reviewSelection,scheduleSelection,configureSelection} from './selectionRepository'
beforeEach(()=>{vi.resetAllMocks()})
describe('weekly selection repository',()=>{
  it('loads only admin RPC data and private signed selected thumbnails',async()=>{
    mock.rpc.mockResolvedValue(selectionFixture());mock.signedImage.mockResolvedValue('https://example.test/signed')
    const result=await getSelectionDashboard('run-1')
    expect(mock.rpc).toHaveBeenCalledWith('get_weekly_selections',{p_run_id:'run-1'})
    expect(mock.signedImage).toHaveBeenCalledExactlyOnceWith('seller/art/front.png')
    expect(result.candidates[0].thumbnail).toBe('https://example.test/signed')
  })
  it('retains an honest missing thumbnail on signing failure',async()=>{
    mock.rpc.mockResolvedValue(selectionFixture());mock.signedImage.mockRejectedValue(new Error('Unavailable'))
    expect((await getSelectionDashboard()).candidates[0].thumbnail).toBeUndefined()
  })
  it('rejects invalid/out-of-range server scoring data',async()=>{
    const data=selectionFixture();data.candidates[0].score=101;mock.rpc.mockResolvedValue(data)
    await expect(getSelectionDashboard()).rejects.toThrow()
  })
  it('does not sign excluded or unselected candidate images',async()=>{
    const data=selectionFixture();data.candidates[0].selected_position=null;mock.rpc.mockResolvedValue(data)
    await getSelectionDashboard();expect(mock.signedImage).not.toHaveBeenCalled()
    data.candidates[0].selected_position=1;data.candidates[0].artwork_id=null
    const historical=await getSelectionDashboard()
    expect(historical.candidates[0].snapshot.title).toBe('Original Painting')
    expect(historical.candidates[0].artwork_id).toBeNull()
    expect(mock.signedImage).not.toHaveBeenCalled()
  })
  it('sends minimal RPC inputs without roles, prices, stock or browser selected artwork IDs',async()=>{
    await generateSelection('2026-10-28T12:30:00Z');await reviewSelection('run-1','APPROVE','Reviewed');await scheduleSelection('run-1')
    expect(mock.rpc.mock.calls).toEqual([
      ['generate_weekly_selection',{p_starts_at:'2026-10-28T12:30:00Z',p_regenerate:false}],
      ['review_weekly_selection',{p_run_id:'run-1',p_action:'APPROVE',p_reason:'Reviewed'}],
      ['schedule_weekly_selection',{p_run_id:'run-1'}],
    ])
  })
  it('passes configuration to the existing server authorization boundary',async()=>{
    await configureSelection(selectionFixture().config)
    expect(mock.rpc).toHaveBeenCalledWith('configure_weekly_selection',{p_enabled:false,p_timezone:'Asia/Kolkata',p_weekday:0,
      p_local_start:'18:00:00',p_duration_hours:24,p_candidate_limit:250})
  })
})
