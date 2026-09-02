import { useQuery } from 'react-query'
import { ClipboardCheck } from 'lucide-react'
import api from '../api/axios'
import { EmptyState, PageHeader, SkeletonCard } from '../components/ui'

export default function ProjectTemplates() {
  const { data, isLoading, isError } = useQuery('project-templates', async () => (await api.get('/project-templates/')).data)
  const templates = data?.templates || []

  return (
    <div className="space-y-6">
      <PageHeader title="Project Templates" description="Reusable project blueprints." />
      {isLoading ? <SkeletonCard /> : isError ? <EmptyState icon={ClipboardCheck} title="Could not load templates" description="The project templates could not be loaded." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => <div key={template.id} className="rounded-lg border border-surface-border bg-surface p-4"><h2 className="font-semibold text-text-primary">{template.name}</h2><p className="mt-1 text-sm text-text-muted">{template.description || 'No description'}</p><span className="mt-4 block text-xs text-text-muted">{template.task_count} tasks</span></div>)}
          {!templates.length && <div className="text-sm text-text-muted">No project templates</div>}
        </div>
      )}
    </div>
  )
}
