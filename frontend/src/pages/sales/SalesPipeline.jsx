import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { Badge, EmptyState, LoadingSpinner, PageHeader } from '../../components/ui'
import { asArray, formatMoney, getId } from '../phase4Utils'

export default function SalesPipeline() {
  const queryClient = useQueryClient()
  const stagesQuery = useQuery('sales-stages', salesApi.getStages)
  const prospectsQuery = useQuery('sales-pipeline-prospects', () => salesApi.getProspects({ limit: 200 }))
  const stages = asArray(stagesQuery.data, ['stages'])
  const prospects = asArray(prospectsQuery.data, ['prospects'])
  const fallbackStages = stages.length ? stages : [{ id: 'new', name: 'New' }, { id: 'qualified', name: 'Qualified' }, { id: 'won', name: 'Won' }]
  const mutation = useMutation(({ id, stageId }) => salesApi.updateStage(id, stageId), {
    onSuccess: () => {
      toast.success('Stage updated')
      queryClient.invalidateQueries('sales-pipeline-prospects')
    },
  })

  const grouped = useMemo(() => prospects.reduce((acc, item) => {
    const stage = item.current_stage || 'new'
    acc[stage] = acc[stage] || []
    acc[stage].push(item)
    return acc
  }, {}), [prospects])

  const onDragEnd = ({ active, over }) => {
    if (active?.id && over?.id) mutation.mutate({ id: active.id, stageId: over.id })
  }

  return (
    <div className="p-6">
      <PageHeader title="Sales Pipeline" description="Drag prospects between stages." />
      {stagesQuery.isLoading || prospectsQuery.isLoading ? <LoadingSpinner label="Loading pipeline" /> : prospects.length ? (
        <DndContext onDragEnd={onDragEnd}>
          <div className="grid min-h-[30rem] gap-4 overflow-x-auto md:grid-cols-3 xl:grid-cols-4">
            {fallbackStages.map((stage) => {
              const stageId = getId(stage) || stage.name
              return <StageColumn key={stageId} id={stageId} title={stage.name || stage.label || stageId} prospects={grouped[stageId] || []} />
            })}
          </div>
        </DndContext>
      ) : <EmptyState title="No prospects in pipeline" description="Create prospects to start using the board." />}
    </div>
  )
}

function StageColumn({ id, title, prospects }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={`rounded-lg border border-gray-200 bg-gray-50 p-3 ${isOver ? 'ring-2 ring-primary-500' : ''}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-gray-900">{title}</h2><Badge label={prospects.length} /></div>
      <div className="space-y-3">
        {prospects.map((prospect) => <ProspectCard key={getId(prospect)} prospect={prospect} />)}
      </div>
    </section>
  )
}

function ProspectCard({ prospect }) {
  const id = getId(prospect)
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id })
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} {...listeners} {...attributes} className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="font-medium text-gray-900">{prospect.prospect_name || `${prospect.first_name || ''} ${prospect.last_name || ''}`}</h3>
      <p className="mt-1 text-sm text-gray-500">{prospect.company_name || 'No company'}</p>
      <p className="mt-3 text-sm font-semibold text-gray-900">{formatMoney(prospect.won_amount || prospect.value)}</p>
    </article>
  )
}
