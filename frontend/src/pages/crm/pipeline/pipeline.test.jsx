import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  PipelineBoard,
  PipelineEmptyBoardState,
  PipelineFiltersBar,
  PipelineLeadCard,
  PipelineLoadingState,
  PipelineSearchEmptyState,
} from './components'
import { buildPipelineBoard, filterPipelineLeads, moveLeadInBoard } from './utils'

const pipelineResponse = {
  meta: { currency: 'INR' },
  stages: [
    {
      key: 'new',
      name: 'New',
      order: 1,
      leads: [
        {
          id: 'lead-1',
          company_name: 'Acme Pvt Ltd',
          primary_contact: 'Priya Shah',
          owner_name: 'Asha',
          priority: 'high',
          tags: ['hot', 'enterprise'],
          deal_value: 250000,
          days_in_stage: 4,
          created_at: '2026-06-20T00:00:00.000Z',
          current_stage: 'new',
        },
      ],
    },
    {
      key: 'qualified',
      name: 'Qualified',
      order: 2,
      leads: [],
    },
  ],
}

const board = buildPipelineBoard(pipelineResponse)

const renderWithDnd = (ui) => render(<DndContext>{ui}</DndContext>)

describe('crm pipeline helpers', () => {
  it('normalizes board data from the pipeline response', () => {
    expect(board.stages).toHaveLength(2)
    expect(board.leadIndex['lead-1']).toEqual({ stageKey: 'new', stageName: 'New' })
  })

  it('filters leads by search and metadata', () => {
    const leads = board.stages.flatMap((stage) => stage.leads)
    const filtered = filterPipelineLeads(leads, {
      q: 'acme',
      owner: 'asha',
      priority: 'high',
      tags: 'enterprise',
      minValue: '',
      maxValue: '',
      createdFrom: '',
      createdTo: '',
      stage: 'lead',
    })
    expect(filtered).toHaveLength(1)
  })

  it('moves a lead into another stage and updates counts', () => {
    const moved = moveLeadInBoard(board, 'lead-1', 'qualified', {
      id: 'lead-1',
      current_stage: 'qualified',
      days_in_stage: 0,
    })

    expect(moved.stages.find((stage) => stage.key === 'new').leadCount).toBe(0)
    expect(moved.stages.find((stage) => stage.key === 'qualified').leadCount).toBe(1)
    expect(moved.leadIndex['lead-1']).toEqual({ stageKey: 'qualified', stageName: 'Qualified' })
  })
})

describe('crm pipeline ui', () => {
  it('renders the board with stages and lead cards', () => {
    renderWithDnd(
      <PipelineBoard
        stages={board.stages}
        visibleLeads={board.stages.flatMap((stage) => stage.leads)}
        currency="INR"
        onResetFilters={vi.fn()}
      />
    )

    expect(screen.getByLabelText('New stage')).toBeInTheDocument()
    expect(screen.getByLabelText('Qualified stage')).toBeInTheDocument()
    expect(screen.getByText('Acme Pvt Ltd')).toBeInTheDocument()
    expect(screen.getByText('Priya Shah')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
  })

  it('renders the empty board state', () => {
    render(<PipelineEmptyBoardState onResetFilters={vi.fn()} />)
    expect(screen.getByText('No leads in the pipeline')).toBeInTheDocument()
  })

  it('renders the search empty state', () => {
    render(<PipelineSearchEmptyState onResetFilters={vi.fn()} />)
    expect(screen.getByText('No matching leads')).toBeInTheDocument()
  })

  it('renders loading skeletons', () => {
    const { container } = render(<PipelineLoadingState />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders a lead card with actions and metadata', () => {
    renderWithDnd(
      <SortableContext items={['lead-1']} strategy={verticalListSortingStrategy}>
        <PipelineLeadCard
          lead={board.stages[0].leads[0]}
          stage={{
            key: 'new',
            name: 'New',
            previousStageKey: null,
            nextStageKey: 'qualified',
          }}
          currency="INR"
          onCopyLeadId={vi.fn()}
          onMoveLeadToStage={vi.fn()}
          onLeadSelect={vi.fn()}
        />
      </SortableContext>
    )

    expect(screen.getByLabelText('Drag Acme Pvt Ltd')).toBeInTheDocument()
    expect(screen.getByText('Deal value')).toBeInTheDocument()
    expect(screen.getByText('Days in stage')).toBeInTheDocument()
  })

  it('wires filter controls', () => {
    const onChange = vi.fn()
    const onSearchChange = vi.fn()

    render(
      <PipelineFiltersBar
        filters={{
          q: '',
          owner: '',
          priority: '',
          tags: '',
          minValue: '',
          maxValue: '',
          createdFrom: '',
          createdTo: '',
          stage: '',
        }}
        onChange={onChange}
        onResetFilters={vi.fn()}
        ownerOptions={[{ value: 'asha', label: 'Asha' }]}
        stageOptions={[{ value: 'lead', label: 'Lead' }]}
        searchValue=""
        onSearchChange={onSearchChange}
        currency="INR"
      />
    )

    fireEvent.change(screen.getByLabelText('Search pipeline'), { target: { value: 'acme' } })
    fireEvent.change(screen.getByLabelText('Filter by owner'), { target: { value: 'asha' } })

    expect(onSearchChange).toHaveBeenCalledWith('acme')
    expect(onChange).toHaveBeenCalledWith({ owner: 'asha' })
  })
})
