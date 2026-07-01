import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Filter, CheckSquare } from 'lucide-react'
import { tasksAPI } from '../api/tasks'
import { usersAPI } from '../api/users'
import { departmentsAPI } from '../api/departments'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonTable, Table, inputClassName } from '../components/ui'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'

const TASK_COLUMNS = [
  { key: 'title', header: 'Task' },
  { key: 'priority', header: 'Priority' },
  { key: 'status', header: 'Status' },
  { key: 'assigned_to_name', header: 'Owner' },
  { key: 'due_date', header: 'Due', render: (row) => (row.due_date ? format(new Date(row.due_date), 'MMM d, yyyy') : '—') },
]

const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }

export default function Tasks() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const canCreate = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(role)
  const isCompanyAdmin = hasCompanyAdminAccess(role)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({ priority: '', assigned_to: '', department_id: '' })
  const [assignableUsers, setAssignableUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')

  const loadUsers = useCallback(async () => {
    try {
      const data = await usersAPI.getAssignableUsers()
      setAssignableUsers(data.users || [])
    } catch (error) {
      console.error('Error loading users:', error)
      setAssignableUsers([])
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    if (!isCompanyAdmin) return
    try {
      const data = await departmentsAPI.listDepartments()
      setDepartments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading departments:', error)
      setDepartments([])
    }
  }, [isCompanyAdmin])

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await tasksAPI.listTasks(filters)
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('Error loading tasks:', error)
      toast.error('Failed to load tasks')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadDepartments() }, [loadDepartments])
  useEffect(() => { loadTasks() }, [loadTasks])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery.trim()) {
        loadTasks()
        return
      }
      setLoading(true)
      tasksAPI.listTasks(filters)
        .then((data) => {
          const query = searchQuery.toLowerCase()
          setTasks((data.tasks || []).filter((task) =>
            task.title?.toLowerCase().includes(query) ||
            task.description?.toLowerCase().includes(query) ||
            task.id?.toLowerCase().includes(query),
          ))
        })
        .catch(() => toast.error('Failed to load tasks'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [filters, loadTasks, searchQuery])

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99)),
    [tasks],
  )

  const stats = useMemo(() => ({
    total: tasks.length,
    high: tasks.filter((task) => ['critical', 'high'].includes((task.priority || '').toLowerCase())).length,
    dueSoon: tasks.filter((task) => {
      if (!task.due_date) return false
      const diff = (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      return diff <= 7
    }).length,
  }), [tasks])

  const visibleAssignableUsers = selectedDepartmentId
    ? assignableUsers.filter((item) => item.department_id === selectedDepartmentId)
    : assignableUsers

  const handleCreateTask = async (event) => {
    event.preventDefault()
    if (submitting) return
    const formData = new FormData(event.target)
    const taskData = {
      title: formData.get('title'),
      description: formData.get('description') || '',
      assigned_to: formData.get('assigned_to') || '',
      priority: formData.get('priority') || 'medium',
      due_date: formData.get('due_date') || '',
    }
    if (isCompanyAdmin && selectedDepartmentId) taskData.department_id = selectedDepartmentId
    try {
      setSubmitting(true)
      await tasksAPI.createTask(taskData)
      toast.success('Task created successfully')
      setShowCreateModal(false)
      setSelectedDepartmentId('')
      event.target.reset()
      await loadTasks()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Table-first task management with fast filtering and creation."
        actions={canCreate ? (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        ) : null}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Total</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">High priority</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.high}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Due soon</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{stats.dueSoon}</p>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className={`${inputClassName} pl-10`}
              placeholder="Search tasks by title, description, or ID"
            />
          </div>
          <Button variant={showFilters ? 'primary' : 'secondary'} onClick={() => setShowFilters((value) => !value)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="secondary" onClick={() => setShowCreateModal(true)} className="lg:hidden">
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        {showFilters ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FormField label="Priority">
              <select className={inputClassName} value={filters.priority} onChange={(event) => setFilters((state) => ({ ...state, priority: event.target.value }))}>
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </FormField>
            <FormField label="Assigned To">
              <select className={inputClassName} value={filters.assigned_to} onChange={(event) => setFilters((state) => ({ ...state, assigned_to: event.target.value }))}>
                <option value="">All users</option>
                {assignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
              </select>
            </FormField>
            {isCompanyAdmin ? (
              <FormField label="Department">
                <select className={inputClassName} value={filters.department_id} onChange={(event) => setFilters((state) => ({ ...state, department_id: event.target.value }))}>
                  <option value="">All departments</option>
                  {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </FormField>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-4"><SkeletonTable rows={6} cols={5} /></div>
        ) : sortedTasks.length ? (
          <Table
            columns={TASK_COLUMNS}
            data={sortedTasks.map((task) => ({
              ...task,
              priority: <Badge label={task.priority || 'medium'} colorKey={task.priority || 'medium'} />,
              status: <Badge label={(task.status || 'todo').replace(/_/g, ' ')} colorKey={task.status || 'todo'} />,
            }))}
            emptyMessage="No tasks found"
          />
        ) : (
          <div className="p-6">
            <EmptyState
              icon={CheckSquare}
              title="No tasks found"
              description="Adjust filters or create a new task to populate the queue."
              action={canCreate ? <Button onClick={() => setShowCreateModal(true)}><Plus className="h-4 w-4" /> Create Task</Button> : null}
            />
          </div>
        )}
      </section>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create task">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <FormField label="Title" required>
            <input name="title" required className={inputClassName} placeholder="Task title" />
          </FormField>
          <FormField label="Description">
            <textarea name="description" rows={3} className={inputClassName} placeholder="Task details" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Priority">
              <select name="priority" defaultValue="medium" className={inputClassName}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
            <FormField label="Due date">
              <input type="datetime-local" name="due_date" className={inputClassName} />
            </FormField>
          </div>
          <FormField label="Assign to">
            <select name="assigned_to" className={inputClassName} disabled={!visibleAssignableUsers.length}>
              <option value="">Unassigned</option>
              {visibleAssignableUsers.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
            </select>
          </FormField>
          {isCompanyAdmin ? (
            <FormField label="Department">
              <select value={selectedDepartmentId} onChange={(event) => setSelectedDepartmentId(event.target.value)} className={inputClassName}>
                <option value="">No department</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Create task</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
