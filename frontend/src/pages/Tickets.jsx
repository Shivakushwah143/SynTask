import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, User, Calendar, X, GripVertical, Settings, Edit, Trash2, Inbox, AlertCircle, Activity, CheckCircle2, Clock3, LineChart, TrendingUp, Users } from 'lucide-react'
import { useConfirmation } from '../hooks/useConfirmation'
import { Link } from 'react-router-dom'
import { ticketsAPI } from '../api/tickets'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import TicketDetailModal from '../components/TicketDetailModal'
import { Button, FormField, SkeletonKanban, inputClassName } from '../components/ui'
import { CRMSection, CRMStatCard } from '../components/crm'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ROLE, normalizeRole } from '../utils/roles'
import { timeService } from '@/services/timeService'

// Sortable Ticket Card Component
const SortableTicketCard = ({ ticket, onClick, priorities, statuses }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        console.log('Ticket card clicked (container):', ticket)
        onClick?.(ticket)
      }}
      className="group cursor-pointer rounded-lg border border-surface-border bg-surface/95 p-4 shadow-sm transition-colors hover:border-primary-200 hover:bg-surface-muted/70 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            aria-label={`Move ${ticket.title}`}
            className="mt-0.5 cursor-grab rounded-md p-1 text-text-muted transition hover:bg-surface-muted hover:text-primary-600 active:cursor-grabbing dark:hover:bg-gray-800"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-text-primary dark:text-gray-100">
            {ticket.title}
          </p>
        </div>
        <span className={`badge ${statuses[ticket.status]?.color || 'badge-secondary'} ml-2 text-xs`}>
          {statuses[ticket.status]?.label || ticket.status}
        </span>
      </div>

      {ticket.description && (
        <p className="mb-3 mt-3 line-clamp-2 text-sm leading-6 text-text-secondary dark:text-gray-400">
          {ticket.description}
        </p>
      )}

      <div className="grid gap-3 border-t border-surface-border pt-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${ticketPriorityPill(ticket.priority)}`}>
            {priorities[ticket.priority]?.label || ticket.priority}
          </span>
          {ticket.created_at ? (
            <div className="flex items-center text-xs text-text-secondary dark:text-gray-400">
              <Calendar className="mr-1 h-3.5 w-3.5" />
              {format(timeService.instant(ticket.created_at), 'MMM d')}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-secondary dark:text-gray-400">
          <User className="h-3.5 w-3.5" />
          <span>{ticket.assigned_to ? 'Assigned' : 'Unassigned'}</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (onClick) {
              onClick(ticket)
            }
          }}
          className="inline-flex min-h-9 w-fit items-center rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 dark:bg-primary-950/40 dark:text-primary-200 dark:hover:bg-primary-950/70"
        >
          Open
        </button>
      </div>
    </div>
  )
}

const StatusColumn = ({ status, tickets, priorities, statusesMap, onTicketClick, canManageColumns, onEditColumn, onDeleteColumn }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] w-[min(82vw,310px)] flex-shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm transition-colors md:w-[292px] ${isOver ? 'border-primary-300 bg-primary-50/60 ring-2 ring-primary-200 dark:bg-primary-950/30' : 'border-surface-border bg-surface/95 dark:border-gray-800 dark:bg-gray-900'}`}
    >
      <div className={`h-1.5 ${statusAccent(status.id)}`} />
      <div className="flex items-center justify-between gap-3 border-b border-surface-border p-4 dark:border-gray-800">
        <div>
          <h3 className="font-semibold text-text-primary dark:text-gray-100">{status.label}</h3>
          <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">{columnSubtitle(status.id)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-secondary text-xs">
            {tickets.length}
          </span>
          {canManageColumns && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEditColumn(status)
                }}
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-primary-600 dark:hover:bg-gray-900"
                title="Edit column"
                aria-label={`Edit ${status.label} column`}
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteColumn(status)
                }}
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                title="Delete column"
                aria-label={`Delete ${status.label} column`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 bg-surface-muted/60 p-3 dark:bg-gray-950/40">
        <SortableContext
          id={status.id}
          items={tickets.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface/90 px-4 py-8 text-center text-sm text-text-muted dark:border-gray-700 dark:bg-gray-900/60">
                <Inbox className="mb-2 h-5 w-5 text-text-muted" aria-hidden="true" />
                No requests here
              </div>
            ) : (
              tickets.map((ticket) => (
                <SortableTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => onTicketClick(ticket)}
                  priorities={priorities}
                  statuses={statusesMap}
                />
              ))
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

const TicketBarChart = ({ title, description, data }) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1)
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary dark:text-gray-100">{title}</h3>
          <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">{description}</p>
        </div>
        <LineChart className="h-5 w-5 text-primary-600" />
      </div>
      <div className="mt-4 space-y-3">
        {data.map((item) => {
          const width = `${Math.max((item.value / maxValue) * 100, item.value ? 8 : 0)}%`
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-text-secondary dark:text-gray-300">{item.label}</span>
                <span className="font-semibold tabular-nums text-text-primary dark:text-gray-100">{item.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-800">
                <div className={`h-full rounded-full ${item.color}`} style={{ width }} />
              </div>
            </div>
          )
        })}
      </div>
    </article>
  )
}

const SignalTile = ({ label, value, helper, icon: Icon, tone = 'amber' }) => {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    stone: 'bg-stone-50 text-stone-700 dark:bg-stone-950/40 dark:text-stone-200',
  }
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary dark:text-gray-100">{value}</p>
      <p className="mt-1 text-xs text-text-secondary dark:text-gray-400">{helper}</p>
    </article>
  )
}

const Tickets = () => {
  const { user } = useAuthStore()
  const { confirm } = useConfirmation()
  const userRole = normalizeRole(user?.role)
  const canManageRequests = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(userRole)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [teamMembers, setTeamMembers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    type: '',
  })

  const sensors = useSensors(
    // Add small drag distance so simple clicks do NOT start dragging
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Default statuses - can be customized
  const defaultStatuses = [
    { id: 'open', label: 'Open', color: 'badge-warning', order: 0 },
    { id: 'in_progress', label: 'In Progress', color: 'badge-primary', order: 1 },
    { id: 'waiting_for_customer', label: 'Waiting', color: 'badge-secondary', order: 2 },
    { id: 'resolved', label: 'Resolved', color: 'badge-success', order: 3 },
    { id: 'closed', label: 'Closed', color: 'badge-secondary', order: 4 },
    { id: 'reopened', label: 'Reopened', color: 'badge-warning', order: 5 },
  ]

  // Load statuses from localStorage or use defaults
  const loadStatuses = () => {
    try {
      const saved = localStorage.getItem('ticket_statuses')
      if (saved) {
        const parsed = JSON.parse(saved)
        return parsed.length > 0 ? parsed : defaultStatuses
      }
    } catch (error) {
      console.error('Error loading saved statuses:', error)
    }
    return defaultStatuses
  }

  const [statuses, setStatuses] = useState(loadStatuses())

  // Calculate statusesMap from current statuses (memoized for performance)
  const statusesMap = useMemo(() => {
    return statuses.reduce((acc, s) => {
      acc[s.id] = { label: s.label, color: s.color }
      return acc
    }, {})
  }, [statuses])

  // Column management states
  const canManageColumns = [ROLE.ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(userRole)
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [editingColumn, setEditingColumn] = useState(null)
  const [columnForm, setColumnForm] = useState({ label: '', color: 'badge-secondary' })

  const priorities = useMemo(() => ({
    low: { label: 'Low', color: 'text-stone-600' },
    medium: { label: 'Medium', color: 'text-amber-600' },
    high: { label: 'High', color: 'text-orange-600' },
    urgent: { label: 'Urgent', color: 'text-red-600' },
  }), [])

  const types = {
    support: 'Support',
    feature_request: 'Feature Request',
    query: 'Query',
    complaint: 'Complaint',
  }

  const ticketStats = useMemo(() => {
    const activeCount = tickets.filter((ticket) => !['closed', 'resolved'].includes(ticket.status)).length
    const urgentCount = tickets.filter((ticket) => ticket.priority === 'urgent').length
    const unassignedCount = tickets.filter((ticket) => !ticket.assigned_to).length
    const resolvedCount = tickets.filter((ticket) => ['closed', 'resolved'].includes(ticket.status)).length
    return { activeCount, urgentCount, unassignedCount, resolvedCount }
  }, [tickets])

  const sortedStatuses = useMemo(() => [...statuses].sort((a, b) => (a.order || 0) - (b.order || 0)), [statuses])
  const statusChartData = useMemo(() => sortedStatuses.map((status) => ({
    label: status.label,
    value: tickets.filter((ticket) => ticket.status === status.id).length,
    color: statusBarColor(status.id),
  })), [sortedStatuses, tickets])
  const priorityChartData = useMemo(() => Object.keys(priorities).map((priority) => ({
    label: priorities[priority].label,
    value: tickets.filter((ticket) => ticket.priority === priority).length,
    color: priorityBarColor(priority),
  })), [priorities, tickets])

  const hasFilters = Boolean(filters.status || filters.priority || filters.type)

  // Fetch team members for Leads
  useEffect(() => {
    if (userRole === ROLE.LEAD) {
      fetchTeamMembers()
    }
  }, [userRole])

  const fetchTeamMembers = async () => {
    try {
      const data = await usersAPI.getMyTeam()
      setTeamMembers(data.team_members || [])
    } catch (error) {
      console.error('Error loading team members:', error)
    }
  }

  // Save statuses to localStorage
  const saveStatuses = (newStatuses) => {
    try {
      localStorage.setItem('ticket_statuses', JSON.stringify(newStatuses))
      setStatuses(newStatuses)
    } catch (error) {
      console.error('Error saving statuses:', error)
      toast.error('Failed to save column changes')
    }
  }

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true)
      const data = await ticketsAPI.listTickets(filters)
      setTickets(data.tickets || [])
    } catch (error) {
      console.error('Error loading tickets:', error)
      toast.error('Failed to load tickets')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  // Check if we need to open a ticket from notification
  useEffect(() => {
    const ticketId = sessionStorage.getItem('open_ticket_id')
    if (ticketId) {
      sessionStorage.removeItem('open_ticket_id')
      // Wait for tickets to load, then open the modal
      const timer = setTimeout(async () => {
        try {
          const ticketData = await ticketsAPI.getTicket(ticketId)
          setSelectedTicket(ticketData)
          setShowTicketModal(true)
        } catch (error) {
          console.error('Error loading ticket from notification:', error)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [tickets])

  // Get tickets by status
  const getTicketsByStatus = (statusId) => {
    return tickets.filter(ticket => ticket.status === statusId)
  }

  // Handle drag end
  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      return
    }

    const activeTicket = tickets.find(t => t.id === active.id)
    if (!activeTicket) return

    // Determine the destination status: containerId when dropped on a ticket, column id when dropped on empty column
    const destinationStatus = over.data?.current?.sortable?.containerId || over.id
    if (!destinationStatus || destinationStatus === activeTicket.status) return
    if (!statusesMap[destinationStatus]) return

    try {
      await ticketsAPI.updateTicketStatus(active.id, destinationStatus)
      toast.success('Ticket status updated')
      await fetchTickets()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update ticket status')
    }
  }

  // Fetch assignable users for ticket assignment
  const [assignableUsers, setAssignableUsers] = useState([])

  useEffect(() => {
    // All users (Employees, Leads, Admins) can assign tickets
    if (user) {
      fetchAssignableUsers()
    }
  }, [user])

  const fetchAssignableUsers = async () => {
    try {
      // Pass for_tickets=true to get appropriate users based on role
      // Employees get Leads/Admins, Leads/Admins get all users
      const data = await usersAPI.getAssignableUsers(true)
      const users = data.users || []
      // Remove duplicates based on user ID
      const uniqueUsers = users.filter((user, index, self) =>
        index === self.findIndex((u) => String(u.id || u._id) === String(user.id || user._id))
      )
      setAssignableUsers(uniqueUsers)
    } catch (error) {
      console.error('Error loading assignable users:', error)
    }
  }

  // Handle create ticket
  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)

    try {
      setSubmitting(true)

      const ticketData = {
        title: formData.get('title'),
        description: formData.get('description'),
        type: formData.get('type') || 'support',
        priority: formData.get('priority') || 'medium',
        assigned_to: formData.get('assigned_to') || null,
      }

      const result = await ticketsAPI.createTicket(ticketData)
      toast.success(`Ticket created. Number: ${result.ticket_number}`)
      setShowCreateModal(false)
      await fetchTickets()
      e.target.reset()
    } catch (error) {
      console.error('Error creating ticket:', error)
      toast.error(error.response?.data?.detail || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle status change
  const handleStatusChange = async (ticketId, newStatus, resolution = null) => {
    try {
      console.log('Updating ticket status:', { ticketId, newStatus, resolution })
      const result = await ticketsAPI.updateTicketStatus(ticketId, newStatus, resolution)
      console.log('Status update result:', result)
      toast.success('Ticket status updated successfully')
      // Refresh tickets list
      await fetchTickets()
      // Update selected ticket if it's the one being updated
      if (selectedTicket && selectedTicket.id === ticketId) {
        const updatedTicket = await ticketsAPI.getTicket(ticketId)
        setSelectedTicket(updatedTicket)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error(error.response?.data?.detail || 'Failed to update ticket status')
      throw error
    }
  }

  // Handle ticket click
  const handleTicketClick = async (ticket) => {
    // Always open the modal immediately with the data we already have
    console.log('Ticket clicked:', ticket)
    setSelectedTicket(ticket)
    setShowTicketModal(true)

    // Try to load the latest ticket details in the background,
    // but NEVER close the modal if this fails – user should still see edit/delete.
    try {
      const ticketData = await ticketsAPI.getTicket(ticket.id)
      console.log('Loaded ticket data:', ticketData)
      console.log('Current user:', user)
      // Only update if the same ticket is still selected
      setSelectedTicket((current) =>
        current && current.id === ticket.id ? ticketData : current
      )
    } catch (error) {
      console.error('Error loading ticket:', error)
      toast.error('Could not refresh ticket details, using current data')
    }
  }

  // Handle assign ticket
  const handleAssignTicket = async (ticketId, assignedTo) => {
    try {
      await ticketsAPI.assignTicket(ticketId, assignedTo || '')
      toast.success('Ticket assignment updated successfully')
      await fetchTickets()
      // Refresh selected ticket data
      if (selectedTicket && selectedTicket.id === ticketId) {
        try {
          const updatedTicket = await ticketsAPI.getTicket(ticketId)
          setSelectedTicket(updatedTicket)
        } catch (err) {
          console.error('Error refreshing ticket:', err)
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign ticket')
      throw error // Re-throw to let modal handle it
    }
  }

  // Handle edit column
  const handleEditColumn = (column) => {
    setEditingColumn(column)
    setColumnForm({ label: column.label, color: column.color })
    setShowColumnModal(true)
  }

  // Handle delete column
  const handleDeleteColumn = async (column) => {
    // Check if column has tickets
    const ticketsInColumn = tickets.filter(t => t.status === column.id)
    if (ticketsInColumn.length > 0) {
      toast.error(`Cannot delete column with ${ticketsInColumn.length} ticket(s). Please move tickets to another column first.`)
      return
    }

    const confirmed = await confirm({
      title: 'Delete Column',
      message: `Are you sure you want to delete the "${column.label}" column?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (confirmed) {
      const newStatuses = statuses.filter(s => s.id !== column.id).sort((a, b) => a.order - b.order)
      saveStatuses(newStatuses)
      toast.success('Column deleted successfully')
      await fetchTickets()
    }
  }

  // Handle column form submit (create or update)
  const handleColumnSubmit = async (e) => {
    e.preventDefault()
    if (!columnForm.label.trim()) {
      toast.error('Column name is required')
      return
    }

    let newStatuses
    if (editingColumn) {
      // Update existing column
      newStatuses = statuses.map(s =>
        s.id === editingColumn.id
          ? { ...s, label: columnForm.label.trim(), color: columnForm.color }
          : s
      )
      toast.success('Column updated successfully')
    } else {
      // Create new column
      const newId = columnForm.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      // Check if ID already exists
      if (statuses.find(s => s.id === newId)) {
        toast.error('A column with this name already exists')
        return
      }
      const maxOrder = Math.max(...statuses.map(s => s.order || 0), -1)
      newStatuses = [...statuses, {
        id: newId,
        label: columnForm.label.trim(),
        color: columnForm.color,
        order: maxOrder + 1,
      }]
      toast.success('Column created successfully')
    }

    saveStatuses(newStatuses)
    setShowColumnModal(false)
    setEditingColumn(null)
    setColumnForm({ label: '', color: 'badge-secondary' })
  }

  if (loading) {
    return (
      <div className="p-4">
        <SkeletonKanban cols={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      <section className="overflow-hidden rounded-3xl border border-surface-border/80 bg-surface/95 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="h-1.5 bg-gradient-to-r from-primary-500 via-emerald-400 to-amber-300" />
        <div className="p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">Support desk</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary dark:text-gray-100">Requests</h1>
              <p className="mt-2 text-sm leading-6 text-text-secondary dark:text-gray-400">
                Triage, assign, and move tickets across a CRM-style operations board.
              </p>
            </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageColumns && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingColumn(null)
                  setColumnForm({ label: '', color: 'badge-secondary' })
                  setShowColumnModal(true)
                }}
                className="min-h-11"
                title="Manage columns"
              >
                <Settings className="h-4 w-4" />
                Columns
              </Button>
            )}
            {canManageRequests && userRole === ROLE.LEAD && (
              <Link
                to="/tasks?createTask=true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-muted dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </Link>
            )}
            <Button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="min-h-11"
            >
              <Plus className="h-4 w-4" />
              New request
            </Button>
          </div>
        </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CRMStatCard icon={Inbox} label="Total Requests" value={String(tickets.length)} helper="All tickets in the current view." tone="amber" />
        <CRMStatCard icon={Activity} label="Active" value={String(ticketStats.activeCount)} helper="Not resolved or closed." tone="emerald" />
        <CRMStatCard icon={AlertCircle} label="Urgent" value={String(ticketStats.urgentCount)} helper="Needs immediate attention." tone="amber" />
        <CRMStatCard icon={Users} label="Unassigned" value={String(ticketStats.unassignedCount)} helper={`${ticketStats.resolvedCount} resolved or closed.`} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <CRMSection
          title="Ticket Controls"
          description="Filter the board without leaving the request workflow."
          actions={hasFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setFilters({ status: '', priority: '', type: '' })}>
              Clear filters
            </Button>
          ) : null}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField label="Status" htmlFor="ticket-status-filter">
              <select
                id="ticket-status-filter"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className={inputClassName}
              >
                <option value="">All statuses</option>
                {sortedStatuses.map(status => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Priority" htmlFor="ticket-priority-filter">
              <select
                id="ticket-priority-filter"
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className={inputClassName}
              >
                <option value="">All priorities</option>
                {Object.keys(priorities).map(priority => (
                  <option key={priority} value={priority}>{priorities[priority].label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Type" htmlFor="ticket-type-filter">
              <select
                id="ticket-type-filter"
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className={inputClassName}
              >
                <option value="">All types</option>
                {Object.keys(types).map(type => (
                  <option key={type} value={type}>{types[type]}</option>
                ))}
              </select>
            </FormField>
          </div>
        </CRMSection>

        <TicketBarChart
          title="Priority Mix"
          description="Distribution of requests by urgency."
          data={priorityChartData}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <TicketBarChart
          title="Status Flow"
          description="How tickets are distributed across columns."
          data={statusChartData}
        />
        <CRMSection title="Operating Signal" description="Fast read of current desk pressure.">
          <div className="grid gap-3 sm:grid-cols-3">
            <SignalTile label="Resolution" value={`${ticketStats.resolvedCount}/${tickets.length || 0}`} helper="Closed or resolved" icon={CheckCircle2} tone="emerald" />
            <SignalTile label="Queue" value={String(ticketStats.activeCount)} helper="Still open" icon={Clock3} tone="amber" />
            <SignalTile label="Pressure" value={String(ticketStats.urgentCount)} helper="Urgent priority" icon={TrendingUp} tone="amber" />
          </div>
        </CRMSection>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveId(event.active.id)}
        onDragEnd={handleDragEnd}
      >
        <div className="viewport-scroll-x -mx-1 flex gap-4 px-1 pb-3">
          {sortedStatuses.map((status) => {
            const statusTickets = getTicketsByStatus(status.id)
            return (
              <StatusColumn
                key={status.id}
                status={status}
                tickets={statusTickets}
                priorities={priorities}
                statusesMap={statusesMap}
                onTicketClick={handleTicketClick}
                canManageColumns={canManageColumns}
                onEditColumn={handleEditColumn}
                onDeleteColumn={handleDeleteColumn}
              />
            )
          })}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="rounded-lg border border-primary-200 bg-surface px-4 py-3 text-sm font-medium shadow-lg dark:bg-gray-950">
              Moving request
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-screen w-full max-w-lg overflow-y-auto rounded-lg bg-surface/95 p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary dark:text-gray-100">New request</h2>
                <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">Capture the issue clearly so it can be routed quickly.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-2 text-text-muted transition hover:bg-surface-muted hover:text-text-primary dark:hover:bg-gray-900"
                aria-label="Close new request modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <FormField label="Title" htmlFor="ticket-title" required>
                <input
                  id="ticket-title"
                  type="text"
                  name="title"
                  required
                  className={inputClassName}
                  placeholder="Brief description of the issue"
                />
              </FormField>
              <FormField label="Details" htmlFor="ticket-description" required>
                <textarea
                  id="ticket-description"
                  name="description"
                  required
                  rows="4"
                  className={`${inputClassName} resize-y`}
                  placeholder="Detailed description of the issue..."
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Category" htmlFor="ticket-type">
                  <select id="ticket-type" name="type" className={inputClassName}>
                    <option value="support">Support</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="query">Query</option>
                    <option value="complaint">Complaint</option>
                  </select>
                </FormField>
                <FormField label="Priority" htmlFor="ticket-priority">
                  <select id="ticket-priority" name="priority" className={inputClassName} defaultValue="medium">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </FormField>
              </div>
              {assignableUsers.length > 0 && (
                <FormField
                  label="Assignee"
                  htmlFor="ticket-assignee"
                  helperText={userRole === ROLE.EMPLOYEE ? 'Lead or Admin.' : userRole === ROLE.LEAD ? 'Anyone in the company.' : 'Team member.'}
                >
                  <select id="ticket-assignee" name="assigned_to" className={inputClassName}>
                    <option value="">Unassigned</option>
                    {assignableUsers.map((assignUser, index) => {
                      const userId = String(assignUser.id || assignUser._id || index)
                      return (
                        <option key={`create-assign-${userId}-${index}`} value={assignUser.id || assignUser._id}>
                          {assignUser.first_name} {assignUser.last_name} ({assignUser.role})
                        </option>
                      )
                    })}
                  </select>
                </FormField>
              )}
              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  loading={submitting}
                  loadingText="Creating"
                  className="flex-1"
                >
                  Create request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {showTicketModal && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => {
            setShowTicketModal(false)
            setSelectedTicket(null)
            fetchTickets()
          }}
          onStatusChange={handleStatusChange}
          onAssign={handleAssignTicket}
          teamMembers={userRole === ROLE.LEAD ? teamMembers : null}
        />
      )}

      {/* Column Management Modal */}
      {canManageColumns && showColumnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-surface/95 p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start gap-3">
              <AlertCircle className="mt-1 h-5 w-5 text-primary-600" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold text-text-primary dark:text-gray-100">
                  {editingColumn ? 'Edit column' : 'Create column'}
                </h2>
                <p className="mt-1 text-sm text-text-secondary dark:text-gray-400">Keep stages short and easy for the team to scan.</p>
              </div>
            </div>
            <form onSubmit={handleColumnSubmit}>
              <div className="space-y-4">
                <FormField label="Column name" htmlFor="column-name" required>
                  <input
                    id="column-name"
                    type="text"
                    value={columnForm.label}
                    onChange={(e) => setColumnForm({ ...columnForm, label: e.target.value })}
                    className={inputClassName}
                    placeholder="e.g., Open, In Progress, Resolved"
                    required
                    autoComplete="off"
                  />
                </FormField>

                <FormField label="Color" htmlFor="column-color">
                  <select
                    id="column-color"
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className={inputClassName}
                  >
                    <option value="badge-secondary">Gray</option>
                    <option value="badge-primary">Blue</option>
                    <option value="badge-success">Green</option>
                    <option value="badge-warning">Yellow</option>
                    <option value="badge-danger">Red</option>
                    <option value="badge-info">Cyan</option>
                    <option value="badge-purple">Purple</option>
                  </select>
                </FormField>

                {editingColumn && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(editingColumn)}
                      className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false)
                    setEditingColumn(null)
                    setColumnForm({ label: '', color: 'badge-secondary' })
                  }}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                >
                  {editingColumn ? 'Save' : 'Create'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Tickets

function ticketPriorityPill(priority) {
  switch (priority) {
    case 'urgent':
      return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'
    case 'high':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
    case 'medium':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
    case 'low':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    default:
      return 'bg-surface-muted text-text-secondary dark:bg-gray-800 dark:text-gray-200'
  }
}

function priorityBarColor(priority) {
  switch (priority) {
    case 'urgent':
      return 'bg-rose-500'
    case 'high':
      return 'bg-orange-500'
    case 'medium':
      return 'bg-amber-500'
    case 'low':
      return 'bg-emerald-500'
    default:
      return 'bg-stone-400'
  }
}

function statusBarColor(statusId) {
  switch (statusId) {
    case 'open':
      return 'bg-amber-500'
    case 'in_progress':
      return 'bg-amber-500'
    case 'waiting_for_customer':
      return 'bg-stone-400'
    case 'resolved':
      return 'bg-emerald-500'
    case 'closed':
      return 'bg-stone-500'
    case 'reopened':
      return 'bg-rose-500'
    default:
      return 'bg-primary-500'
  }
}

function statusAccent(statusId) {
  switch (statusId) {
    case 'open':
      return 'bg-amber-400'
    case 'in_progress':
      return 'bg-amber-500'
    case 'waiting_for_customer':
      return 'bg-stone-300'
    case 'resolved':
      return 'bg-emerald-500'
    case 'closed':
      return 'bg-stone-500'
    case 'reopened':
      return 'bg-rose-500'
    default:
      return 'bg-primary-500'
  }
}

function columnSubtitle(statusId) {
  switch (statusId) {
    case 'open':
      return 'New issues to review.'
    case 'in_progress':
      return 'Work in motion.'
    case 'waiting_for_customer':
      return 'Waiting on a reply.'
    case 'resolved':
      return 'Ready for review.'
    case 'closed':
      return 'Archived requests.'
    case 'reopened':
      return 'Needs another look.'
    default:
      return 'Requests in this stage.'
  }
}
