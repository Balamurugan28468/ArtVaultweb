import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {selectionFixture} from '../testFixtures'
const mock=vi.hoisted(()=>({getSelectionDashboard:vi.fn(),generateSelection:vi.fn(),reviewSelection:vi.fn(),scheduleSelection:vi.fn(),configureSelection:vi.fn()}))
vi.mock('../api/selectionRepository',()=>mock)
import {WeeklySelectionReview} from './WeeklySelectionReview'
beforeEach(()=>{vi.resetAllMocks();mock.getSelectionDashboard.mockResolvedValue(selectionFixture());mock.reviewSelection.mockResolvedValue('run-1')})
describe('admin weekly selection review',()=>{
  it('labels heuristic output, real shortages, rank and explicit approval controls',async()=>{
    render(<WeeklySelectionReview/>);
    expect(await screen.findByText('1. Original Painting')).toBeInTheDocument()
    expect(screen.getByText(/Heuristic ranking — no visual AI model executed/)).toBeInTheDocument()
    expect(screen.getByText(/4 fewer than/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Approve selection'})).toBeEnabled()
    expect(screen.getByRole('button',{name:'Schedule approved auction'})).toBeDisabled()
  })
  it('generates a selection without scheduling automatically',async()=>{
    mock.generateSelection.mockResolvedValue('run-1')
    render(<WeeklySelectionReview/>);await screen.findByText('1. Original Painting')
    fireEvent.change(screen.getByLabelText(/Auction start \(your local time\)/),{target:{value:'2026-10-28T18:00'}})
    fireEvent.click(screen.getByRole('button',{name:'Generate selection'}))
    await waitFor(()=>expect(mock.generateSelection).toHaveBeenCalledTimes(1))
    expect(mock.scheduleSelection).not.toHaveBeenCalled()
  })
  it('reviews first, then schedules one approved event through its trusted RPC',async()=>{
    const data=selectionFixture()
    render(<WeeklySelectionReview/>);await screen.findByText('1. Original Painting')
    fireEvent.change(screen.getByLabelText('Review reason'),{target:{value:'Checked eligible items'}})
    data.runs[0].status='APPROVED';mock.getSelectionDashboard.mockResolvedValue(data)
    fireEvent.click(screen.getByRole('button',{name:'Approve selection'}))
    await waitFor(()=>expect(mock.reviewSelection).toHaveBeenCalledWith('run-1','APPROVE','Checked eligible items'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'Schedule approved auction'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'Schedule approved auction'}))
    await waitFor(()=>expect(mock.scheduleSelection).toHaveBeenCalledExactlyOnceWith('run-1'))
  })
  it('blocks stale scheduling and requests an eligibility refresh without changing snapshots',async()=>{
    const data=selectionFixture();data.runs[0].status='APPROVED';data.candidates[0].stale=true
    mock.getSelectionDashboard.mockResolvedValue(data)
    render(<WeeklySelectionReview/>);await screen.findByText('1. Original Painting')
    expect(screen.getByRole('button',{name:'Schedule approved auction'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'Approve selection'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'Refresh eligibility'}))
    await waitFor(()=>expect(mock.reviewSelection).toHaveBeenCalledWith('run-1','REFRESH',''))
  })
  it('rejects and regenerates only through authorized server operations',async()=>{
    const data=selectionFixture();data.runs[0].status='REJECTED';mock.getSelectionDashboard.mockResolvedValue(data)
    render(<WeeklySelectionReview/>);await screen.findByText('1. Original Painting')
    fireEvent.click(screen.getByRole('button',{name:'Regenerate selection'}))
    await waitFor(()=>expect(mock.reviewSelection).toHaveBeenCalledWith('run-1','REGENERATE',''))
    expect(mock.scheduleSelection).not.toHaveBeenCalled()
  })
  it('keeps scheduled history immutable without inviting replacement of committed lots',async()=>{
    const data=selectionFixture();data.runs[0].status='SCHEDULED';data.candidates[0].stale=true
    data.candidates[0].currentReasons=['AUCTION_CONFLICT'];mock.getSelectionDashboard.mockResolvedValue(data)
    render(<WeeklySelectionReview/>);await screen.findByText('1. Original Painting')
    expect(screen.getByText(/Committed auction selection/)).toBeInTheDocument()
    expect(screen.queryByText(/Reject and regenerate before scheduling/)).not.toBeInTheDocument()
    for(const name of ['Refresh eligibility','Approve selection','Reject selection','Regenerate selection','Schedule approved auction'])expect(screen.getByRole('button',{name})).toBeDisabled()
  })
  it('does not manufacture candidates for an empty eligible pool',async()=>{
    const data=selectionFixture();data.candidates=[];data.runs[0].selected_count=0;data.runs[0].eligible_count=0;mock.getSelectionDashboard.mockResolvedValue(data)
    render(<WeeklySelectionReview/>);await screen.findByText(/0 selected from 0 eligible/)
    expect(screen.getByRole('button',{name:'Approve selection'})).toBeDisabled()
    expect(screen.queryByText('1. Original Painting')).not.toBeInTheDocument()
    data.runs[0].status='FAILED';data.runs[0].failure_code='CANDIDATE_LIMIT'
    mock.getSelectionDashboard.mockResolvedValue(data)
    fireEvent.click(screen.getByRole('button',{name:'Refresh eligibility'}))
    expect(await screen.findByText(/Preparation incomplete; eligible totals/)).toBeInTheDocument()
    expect(screen.queryByText(/0 selected from 0 eligible/)).not.toBeInTheDocument()
  })
  it('shows a safe server permission error and supports read retry',async()=>{
    mock.getSelectionDashboard.mockRejectedValueOnce({message:'You do not have permission to do that.'})
    render(<WeeklySelectionReview/>);expect(await screen.findByRole('alert')).toHaveTextContent('permission')
    fireEvent.click(screen.getByRole('button',{name:'Retry selections'}))
    expect(await screen.findByText('1. Original Painting')).toBeInTheDocument()
  })
})
