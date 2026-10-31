import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/supabase/data',()=>mocks)
import {getAssistantConversation,listAssistantHistory,sendAssistantMessage} from './assistantRepository'
const message={id:'message',role:'ASSISTANT',content:'Canonical FAQ',sequence:2,method:'FAQ',links:[{label:'Orders',href:'/orders'}]}
beforeEach(()=>vi.resetAllMocks())
describe('assistant RPC boundary',()=>{
  it('uses authenticated RPC identity without browser roles, user IDs or supplied assistant answers',async()=>{
    mocks.rpc.mockResolvedValue({conversationId:'conversation',messages:[{...message,id:'user',role:'USER',sequence:1,method:null,links:[]},message]})
    await sendAssistantMessage('Order help','request-id',null)
    expect(mocks.rpc).toHaveBeenCalledWith('send_assistant_message',{p_message:'Order help',p_request_id:'request-id',p_conversation_id:null})
  })
  it('reads only the bounded owner history contract',async()=>{
    mocks.rpc.mockResolvedValue([]);expect(await listAssistantHistory()).toEqual([])
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_assistant_history')
  })
  it('loads a requested conversation through its ownership-checking RPC',async()=>{
    mocks.rpc.mockResolvedValue({id:'conversation',messages:[message]})
    expect((await getAssistantConversation('conversation')).messages).toHaveLength(1)
    expect(mocks.rpc).toHaveBeenCalledWith('get_assistant_conversation',{p_conversation_id:'conversation'})
  })
  it('rejects SYSTEM prompts, unsafe navigation and invalid response structure',async()=>{
    for(const invalid of [{...message,role:'SYSTEM'},{...message,links:[{label:'Bad',href:'javascript:alert(1)'}]},{...message,content:''}]){
      mocks.rpc.mockResolvedValue({id:'conversation',messages:[invalid]})
      await expect(getAssistantConversation('conversation')).rejects.toThrow()
    }
  })
  it('preserves RPC failures for retry without falling back to forged persisted messages',async()=>{
    mocks.rpc.mockRejectedValue({code:'network'})
    await expect(sendAssistantMessage('help','retry-id','conversation')).rejects.toEqual({code:'network'})
  })
})
