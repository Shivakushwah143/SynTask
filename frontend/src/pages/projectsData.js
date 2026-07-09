const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value))

const getProgress = (project) => {
  if (typeof project.progress_percentage === 'number') return clamp(Math.round(project.progress_percentage))
  const total = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
  if (!total) return 0
  return clamp(Math.round((Number(project.completed_task_count || 0) / total) * 100))
}

const getOwner = (project) => (
  project.assigned_to_name
  || project.lead_name
  || project.owner_name
  || project.manager_name
  || project.created_by_name
  || 'Unassigned'
)

export function buildProjectGraphRows(projects, limit = 6) {
  return projects.slice(0, limit).map((project) => {
    const totalTasks = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
    const progress = getProgress(project)
    const completedTasks = Number(project.completed_task_count ?? Math.round((progress / 100) * totalTasks))
    return {
      id: project.id,
      name: project.name || 'Untitled project',
      key: project.key || project.project_id || '',
      owner: getOwner(project),
      progress,
      completedTasks,
      totalTasks,
      remainingTasks: Math.max(totalTasks - completedTasks, 0),
      status: project.status || 'active',
    }
  })
}

export function buildProjectGraphSummary(projects) {
  return projects.reduce((summary, project) => {
    const totalTasks = Number(project.task_count || project.tasks_count || project.tasks?.length || 0)
    const completedTasks = Number(project.completed_task_count ?? Math.round((getProgress(project) / 100) * totalTasks))
    summary.totalTasks += totalTasks
    summary.remainingTasks += Math.max(totalTasks - completedTasks, 0)
    return summary
  }, { totalTasks: 0, remainingTasks: 0 })
}
