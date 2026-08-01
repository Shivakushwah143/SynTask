import { useState, useEffect, useMemo, useCallback } from 'react'
import { 
  Plus, User, Calendar, X, GripVertical, Settings, Edit, Trash2, 
  Inbox, AlertCircle, Activity, CheckCircle2, Clock3, LineChart, 
  TrendingUp, Users, Zap, Target, Award, BarChart3, PieChart, 
  Sparkles, Rocket, Clock, AlertTriangle, CheckCheck, UserCheck, 
  Briefcase, ArrowRight, Ticket 
} from 'lucide-react'
import { excludeCurrentUser } from '../utils/userFilters'
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

  const priorityColors = {
    low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onClick?.(ticket)}
      className={`group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-lg hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2 flex-1">
          <button
            type="button"
            aria-label={`Move ${ticket.title}`}
            className="mt-0.5 cursor-grab rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600 active:cursor-grabbing dark:hover:bg-gray-700"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {ticket.title}
            </p>
            {ticket.description && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {ticket.description}
              </p>
            )}
          </div>
        </div>
        <span className={`badge ${statuses[ticket.status]?.color || 'badge-secondary'} ml-2 text-xs whitespace-nowrap`}>
          {statuses[ticket.status]?.label || ticket.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[ticket.priority] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
            {priorities[ticket.priority]?.label || ticket.priority}
          </span>
          {ticket.created_at ? (
            <div className="flex items-center text-xs text-text-secondary dark:text-gray-400">
              <Calendar className="mr-1 h-3.5 w-3.5" />
              {timeService.formatPattern(ticket.created_at, 'MMM d')}
            </div>
          ) : null}
          {ticket.assigned_to ? (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <User className="h-3 w-3" />
              <span>Assigned</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              <span>Unassigned</span>
            </span>
          )}
        </div>
        {ticket.created_at && (
          <div className="flex items-center text-xs text-gray-400 dark:text-gray-500">
            <Calendar className="mr-1 h-3 w-3" />
            {timeService.formatMonthDay(ticket.created_at)}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (onClick) onClick(ticket)
        }}
        className="mt-3 w-full rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
      >
        Open Ticket
      </button>
    </div>
  )
}

const StatusColumn = ({ status, tickets, priorities, statusesMap, onTicketClick, canManageColumns, onEditColumn, onDeleteColumn }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  const statusColors = {
    open: 'from-amber-400 to-orange-400',
    in_progress: 'from-blue-400 to-indigo-400',
    waiting_for_customer: 'from-gray-400 to-stone-400',
    resolved: 'from-emerald-400 to-green-400',
    closed: 'from-gray-500 to-stone-500',
    reopened: 'from-rose-400 to-pink-400',
  }

  const statusIcons = {
    open: <Inbox className="h-4 w-4" />,
    in_progress: <Activity className="h-4 w-4" />,
    waiting_for_customer: <Clock className="h-4 w-4" />,
    resolved: <CheckCheck className="h-4 w-4" />,
    closed: <CheckCircle2 className="h-4 w-4" />,
    reopened: <AlertTriangle className="h-4 w-4" />,
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] w-[min(82vw,310px)] flex-shrink-0 flex-col overflow-hidden rounded-2xl border shadow-lg transition-all md:w-[292px] ${isOver ? 'border-indigo-300 bg-indigo-50/60 ring-2 ring-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-700' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}
    >
      <div className={`h-2 bg-gradient-to-r ${statusColors[status.id] || 'from-gray-400 to-gray-500'}`} />
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${statusColors[status.id] ? 'bg-opacity-10' : ''}`}>
            {statusIcons[status.id] || <Activity className="h-4 w-4 text-gray-400" />}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{status.label}</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{columnSubtitle(status.id)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-indigo-100 px-2 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {tickets.length}
          </span>
          {canManageColumns && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEditColumn(status)
                }}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-gray-700"
                title="Edit column"
              >
                <Edit className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteColumn(status)
                }}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                title="Delete column"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 bg-gray-50/50 p-3 dark:bg-gray-900/40">
        <SortableContext
          id={status.id}
          items={tickets.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white/50 px-4 py-8 text-center dark:border-gray-700 dark:bg-gray-800/50">
                <Inbox className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No requests</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Tickets will appear here</p>
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

// Bar Chart Component
const TicketBarChart = ({ title, description, data, icon: Icon, color = 'indigo' }) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1)
  const colorMap = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        {Icon && <Icon className="h-5 w-5 text-indigo-500" />}
      </div>
      <div className="mt-4 space-y-3">
        {data.map((item) => {
          const width = `${Math.max((item.value / maxValue) * 100, item.value ? 6 : 0)}%`
          const barColor = item.color || colorMap[color]
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{item.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Signal Tile Component
const SignalTile = ({ label, value, helper, icon: Icon, tone = 'amber', trend, trendValue }) => {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    slate: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800',
  }

  return (
    <div className={`rounded-2xl border ${tones[tone] || tones.amber} bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800`}>
      <div className="flex items-center justify-between">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.amber}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className={`text-xs font-semibold ${trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}%
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
    </div>
  )
}

// Quick Action Card
const QuickActionCard = ({ icon: Icon, label, description, href, onClick, color = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
  }

  const Element = href ? Link : 'button'
  const props = {
    className: "group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800",
    ...(href ? { to: href } : { type: 'button', onClick }),
  }

  return (
    <Element {...props}>
      <div className={`absolute right-0 top-0 -mr-8 -mt-8 h-20 w-20 rounded-full bg-gradient-to-r ${colors[color]} opacity-10 blur-2xl`}></div>
      <div className="relative flex items-center gap-3">
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2.5 text-white shadow-lg`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-gray-400 transition group-hover:translate-x-1 group-hover:text-indigo-600" />
      </div>
    </Element>
  )
}

const Tickets = () => {
  const { user } = useAuthStore()
  const { confirm } = useConfirmation()
  const userRole = normalizeRole(user?.role)
  const canManageRequests = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(userRole)
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const defaultStatuses = [
    { id: 'open', label: 'Open', color: 'badge-warning', order: 0 },
    { id: 'in_progress', label: 'In Progress', color: 'badge-primary', order: 1 },
    { id: 'waiting_for_customer', label: 'Waiting', color: 'badge-secondary', order: 2 },
    { id: 'resolved', label: 'Resolved', color: 'badge-success', order: 3 },
    { id: 'closed', label: 'Closed', color: 'badge-secondary', order: 4 },
    { id: 'reopened', label: 'Reopened', color: 'badge-warning', order: 5 },
  ]

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

  const statusesMap = useMemo(() => {
    return statuses.reduce((acc, s) => {
      acc[s.id] = { label: s.label, color: s.color }
      return acc
    }, {})
  }, [statuses])

  const canManageColumns = [ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.SUPER_ADMIN, ROLE.LEAD].includes(userRole)
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
    const highPriorityCount = tickets.filter((ticket) => ['high', 'urgent'].includes(ticket.priority)).length
    return { activeCount, urgentCount, unassignedCount, resolvedCount, highPriorityCount }
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

  const saveStatuses = (newStatuses) => {
    try {
      localStorage.setItem('ticket_statuses', JSON.stringify(newStatuses))
      setStatuses(newStatuses)
    } catch (error) {
      console.error('Error saving statuses:', error)
      toast.error('Failed to save column changes')
    }
  }

  const handleQuickActionAssign = () => {
    setFilters({ status: 'open', priority: '', type: '' })
    toast.success('Filtered to open tickets for assignment')
    setTimeout(() => {
      document.getElementById('ticket-board')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const handleQuickActionUrgent = () => {
    setFilters({ status: '', priority: 'high', type: '' })
    toast.success('Filtered to High & Urgent requests')
    setTimeout(() => {
      document.getElementById('ticket-board')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const handleQuickActionMatrix = () => {
    const el = document.querySelector('[data-section="priority-charts"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
      toast.success('Scrolled to Priority Distribution')
    } else {
      toast.success('Priority Matrix active')
    }
  }

  const handleQuickActionPerformance = () => {
    const el = document.querySelector('[data-section="quick-stats"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
      toast.success('Scrolled to Team Performance Stats')
    } else {
      toast.success('Performance metrics active')
    }
  }

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

  useEffect(() => {
    const ticketId = sessionStorage.getItem('open_ticket_id')
    if (ticketId) {
      sessionStorage.removeItem('open_ticket_id')
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

  const getTicketsByStatus = (statusId) => {
    return tickets.filter(ticket => ticket.status === statusId)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeTicket = tickets.find(t => t.id === active.id)
    if (!activeTicket) return

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

  const [assignableUsers, setAssignableUsers] = useState([])

  useEffect(() => {
    if (user) {
      fetchAssignableUsers()
    }
  }, [user])

  const fetchAssignableUsers = async () => {
    try {
      const data = await usersAPI.getAssignableUsers(true)
      const users = data.users || []
      const uniqueUsers = users.filter((user, index, self) =>
        index === self.findIndex((u) => String(u.id || u._id) === String(user.id || user._id))
      )
          setAssignableUsers(excludeCurrentUser(uniqueUsers, user))
    } catch (error) {
      console.error('Error loading assignable users:', error)
    }
  }

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

  const handleStatusChange = async (ticketId, newStatus, resolution = null) => {
    try {
      await ticketsAPI.updateTicketStatus(ticketId, newStatus, resolution)
      toast.success('Ticket status updated successfully')
      await fetchTickets()
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

  const handleTicketClick = async (ticket) => {
    setSelectedTicket(ticket)
    setShowTicketModal(true)

    try {
      const ticketData = await ticketsAPI.getTicket(ticket.id)
      setSelectedTicket((current) =>
        current && current.id === ticket.id ? ticketData : current
      )
    } catch (error) {
      console.error('Error loading ticket:', error)
      toast.error('Could not refresh ticket details, using current data')
    }
  }

  const handleAssignTicket = async (ticketId, assignedTo) => {
    try {
      await ticketsAPI.assignTicket(ticketId, assignedTo || '')
      toast.success('Ticket assignment updated successfully')
      await fetchTickets()
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
      throw error
    }
  }



  const handleEditColumn = (column) => {
    setEditingColumn(column)
    setColumnForm({ label: column.label, color: column.color })
    setShowColumnModal(true)
  }

  const handleDeleteColumn = async (column) => {
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

  const handleColumnSubmit = async (e) => {
    e.preventDefault()
    if (!columnForm.label.trim()) {
      toast.error('Column name is required')
      return
    }

    let newStatuses
    if (editingColumn) {
      newStatuses = statuses.map(s =>
        s.id === editingColumn.id
          ? { ...s, label: columnForm.label.trim(), color: columnForm.color }
          : s
      )
      toast.success('Column updated successfully')
    } else {
      const newId = columnForm.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
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
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-md shadow-lg border border-white/20">
              <Ticket className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl text-white tracking-tight">Service Requests & Tickets</h1>
              <p className="mt-1 text-indigo-100 text-sm">Track, manage & resolve support requests with real-time status boards</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 shadow-lg border border-white/20"
            >
              <Plus className="h-4 w-4" />
              <span>New Request</span>
            </button>
            {canManageColumns && (
              <button
                type="button"
                onClick={() => {
                  setEditingColumn(null)
                  setColumnForm({ label: '', color: 'badge-secondary' })
                  setShowColumnModal(true)
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 shadow-md border border-white/10"
              >
                <Settings className="h-4 w-4" />
                <span>Manage Columns</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats - 6 Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="group rounded-xl border border-indigo-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{tickets.length}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">All requests</p>
        </div>

        <div className="group rounded-xl border border-emerald-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Active</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.activeCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">In progress</p>
        </div>

        <div className="group rounded-xl border border-rose-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Urgent</span>
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.urgentCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Needs attention</p>
        </div>

        <div className="group rounded-xl border border-amber-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Unassigned</span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <User className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.unassignedCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Needs assignment</p>
        </div>

        <div className="group rounded-xl border border-blue-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Resolved</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.resolvedCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Closed/Resolved</p>
        </div>

        <div className="group rounded-xl border border-purple-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">High Priority</span>
            <div className="rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.highPriorityCount}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">High + Urgent</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          icon={Users}
          label="Assign Tickets"
          description="Assign unassigned tickets"
          onClick={handleQuickActionAssign}
          color="indigo"
        />
        <QuickActionCard
          icon={Clock}
          label="Review Urgent"
          description="Check urgent tickets"
          onClick={handleQuickActionUrgent}
          color="rose"
        />
        <QuickActionCard
          icon={Target}
          label="Priority Matrix"
          description="View priority distribution"
          onClick={handleQuickActionMatrix}
          color="amber"
        />
        <QuickActionCard
          icon={Award}
          label="Performance"
          description="Team resolution metrics"
          onClick={handleQuickActionPerformance}
          color="emerald"
        />
      </div>

      {/* Filters and Charts Row */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filter Tickets</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Narrow down the ticket list</p>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters({ status: '', priority: '', type: '' })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All statuses</option>
                {sortedStatuses.map(status => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All priorities</option>
                {Object.keys(priorities).map(priority => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={priority} value={priority}>{priorities[priority].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All types</option>
                {Object.keys(types).map(type => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={type} value={type}>{types[type]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div data-section="priority-charts">
          <TicketBarChart
            title="Priority Distribution"
            description="Requests by urgency level"
            data={priorityChartData}
            icon={BarChart3}
            color="amber"
          />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <TicketBarChart
          title="Status Distribution"
          description="Tickets across all stages"
          data={statusChartData}
          icon={PieChart}
          color="indigo"
        />
        
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800" data-section="quick-stats">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Stats</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Ticket metrics at a glance</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignalTile 
              label="Resolution Rate" 
              value={`${ticketStats.resolvedCount}/${tickets.length || 0}`} 
              helper="Closed or resolved" 
              icon={CheckCircle2} 
              tone="emerald"
              trend="up"
              trendValue="12"
            />
            <SignalTile 
              label="Active Queue" 
              value={String(ticketStats.activeCount)} 
              helper="Still open" 
              icon={Clock3} 
              tone="amber"
            />
            <SignalTile 
              label="Urgent" 
              value={String(ticketStats.urgentCount)} 
              helper="Needs immediate action" 
              icon={AlertTriangle} 
              tone="rose"
            />
            <SignalTile 
              label="Unassigned" 
              value={String(ticketStats.unassignedCount)} 
              helper="Awaiting assignment" 
              icon={User} 
              tone="indigo"
            />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div id="ticket-board" className="scroll-mt-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Kanban Board</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Drag and drop tickets between columns</p>
          </div>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            {tickets.length} tickets
          </span>
        </div>
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(event.active.id)}
          onDragEnd={handleDragEnd}
        >
          <div className="viewport-scroll-x -mx-1 flex gap-4 px-1 pb-3 overflow-x-auto">
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
              <div className="rounded-xl border-2 border-indigo-300 bg-white px-4 py-3 text-sm font-medium shadow-2xl dark:bg-gray-800">
                Moving request...
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-screen w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">New Request</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create a new support ticket</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Brief description of the issue"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  name="description"
                  required
                  rows="4"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Detailed description of the issue..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                  <select name="type" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="support">Support</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="feature_request">Feature Request</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="query">Query</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="complaint">Complaint</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                  <select name="priority" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" defaultValue="medium">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              {assignableUsers.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Assignee</label>
                  <select name="assigned_to" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
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
                </div>
              )}
              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Request'}
                </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start gap-3">
              <Settings className="mt-1 h-5 w-5 text-indigo-600" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingColumn ? 'Edit Column' : 'Create Column'}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your board columns</p>
              </div>
            </div>
            <form onSubmit={handleColumnSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Column Name</label>
                  <input
                    type="text"
                    value={columnForm.label}
                    onChange={(e) => setColumnForm({ ...columnForm, label: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., Open, In Progress, Resolved"
                    required
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
                  <select
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="badge-secondary">Gray</option>
                    <option value="badge-primary">Blue</option>
                    <option value="badge-success">Green</option>
                    <option value="badge-warning">Yellow</option>
                    <option value="badge-danger">Red</option>
                    <option value="badge-info">Cyan</option>
                    <option value="badge-purple">Purple</option>
                  </select>
                </div>

                {editingColumn && (
                  <button
                    type="button"
                    onClick={() => handleDeleteColumn(editingColumn)}
                    className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
                  >
                    Delete Column
                  </button>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false)
                    setEditingColumn(null)
                    setColumnForm({ label: '', color: 'badge-secondary' })
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  {editingColumn ? 'Save Changes' : 'Create Column'}
                </button>
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
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
    case 'high':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200'
    case 'medium':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
    case 'low':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
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
      return 'bg-gray-400'
  }
}

function statusBarColor(statusId) {
  switch (statusId) {
    case 'open':
      return 'bg-amber-500'
    case 'in_progress':
      return 'bg-indigo-500'
    case 'waiting_for_customer':
      return 'bg-gray-400'
    case 'resolved':
      return 'bg-emerald-500'
    case 'closed':
      return 'bg-gray-500'
    case 'reopened':
      return 'bg-rose-500'
    default:
      return 'bg-indigo-500'
  }
}

function columnSubtitle(statusId) {
  switch (statusId) {
    case 'open':
      return 'New issues to review'
    case 'in_progress':
      return 'Work in motion'
    case 'waiting_for_customer':
      return 'Waiting on a reply'
    case 'resolved':
      return 'Ready for review'
    case 'closed':
      return 'Archived requests'
    case 'reopened':
      return 'Needs another look'
    default:
      return 'Requests in this stage'
  }
}
