import { useState, useEffect, useMemo } from 'react'
import { Plus, User, Calendar, X, GripVertical, Settings, Edit, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ticketsAPI } from '../api/tickets'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import TicketDetailModal from '../components/TicketDetailModal'
import { SkeletonKanban } from '../components/ui'
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

// Sortable Ticket Card Component
const SortableTicketCard = ({ ticket, onClick, priorities, statuses }) => {
  const {
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
      className="p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2">
          {/* Drag handle - only this small icon is draggable */}
          <span
            className="cursor-grab text-gray-400 mt-0.5"
            {...useSortable({ id: ticket.id }).attributes}
            {...useSortable({ id: ticket.id }).listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" />
          </span>
          <p className="font-medium text-gray-900 text-sm flex-1">
            {ticket.title}
          </p>
        </div>
        <span className={`badge ${statuses[ticket.status]?.color || 'badge-secondary'} text-xs ml-2`}>
          {statuses[ticket.status]?.label || ticket.status}
        </span>
      </div>

      {ticket.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {ticket.description}
        </p>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${priorities[ticket.priority]?.color || 'text-gray-600'}`}>
          {priorities[ticket.priority]?.label || ticket.priority}
        </span>
        {ticket.created_at && (
          <div className="flex items-center text-xs text-gray-500">
            <Calendar className="h-3 w-3 mr-1" />
            {format(new Date(ticket.created_at), 'MMM d')}
          </div>
        )}
      </div>

      {ticket.assigned_to && (
        <div className="flex items-center mt-2 text-xs text-gray-500">
          <User className="h-3 w-3 mr-1" />
          Assigned
        </div>
      )}

      {/* Explicit View button so users can clearly open the full ticket details */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          console.log('View button clicked for ticket:', ticket)
          if (onClick) {
            onClick(ticket)
          }
        }}
        className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-800 underline"
      >
        View / Edit Request
      </button>
    </div>
  )
}

const StatusColumn = ({ status, tickets, priorities, statusesMap, onTicketClick, canManageColumns, onEditColumn, onDeleteColumn }) => {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div
      ref={setNodeRef}
      className={`card transition-colors ${isOver ? 'ring-2 ring-primary-100 bg-primary-50/40' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{status.label}</h3>
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
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                title="Edit column"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteColumn(status)
                }}
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                title="Delete column"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <SortableContext
        id={status.id}
        items={tickets.map(t => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3 min-h-[200px]">
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No requests
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
  )
}

const Tickets = () => {
  const { user } = useAuthStore()
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

  const priorities = {
    low: { label: 'Low', color: 'text-gray-600' },
    medium: { label: 'Medium', color: 'text-yellow-600' },
    high: { label: 'High', color: 'text-orange-600' },
    urgent: { label: 'Urgent', color: 'text-red-600' },
  }

  const types = {
    support: 'Support',
    feature_request: 'Feature Request',
    query: 'Query',
    complaint: 'Complaint',
  }

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
  const fetchTickets = async () => {
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
  }

  useEffect(() => {
    fetchTickets()
  }, [filters])

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
      toast.success(`✅ Ticket created! Number: ${result.ticket_number}`)
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

    if (window.confirm(`Are you sure you want to delete the "${column.label}" column?`)) {
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
    <div className="p-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Requests</h1>
          <p className="text-gray-600 text-xs mt-0.5">Support and issue tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageColumns && (
            <button
              onClick={() => {
                setEditingColumn(null)
                setColumnForm({ label: '', color: 'badge-secondary' })
                setShowColumnModal(true)
              }}
              className="btn btn-secondary flex items-center justify-center"
              title="Manage columns"
            >
              <Settings className="h-4 w-4 mr-1.5" />
              Columns
            </button>
          )}
          {canManageRequests && userRole === ROLE.LEAD && (
            <Link
              to="/tasks?createTask=true"
              className="btn btn-outline flex items-center justify-center w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Task
            </Link>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center justify-center w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Request
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="input"
            >
              <option value="">All Priorities</option>
              {Object.keys(priorities).map(priority => (
                <option key={priority} value={priority}>{priorities[priority].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="input"
            >
              <option value="">All Types</option>
              {Object.keys(types).map(type => (
                <option key={type} value={type}>{types[type]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveId(event.active.id)}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {statuses.sort((a, b) => (a.order || 0) - (b.order || 0)).map((status) => {
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
            <div className="p-3 bg-white rounded-lg border border-gray-200 shadow-lg">
              Dragging...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Create New Request</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  className="input"
                  placeholder="Brief description of the issue"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  name="description"
                  required
                  rows="4"
                  className="input"
                  placeholder="Detailed description of the issue..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select name="type" className="input">
                  <option value="support">Support</option>
                  <option value="feature_request">Feature Request</option>
                  <option value="query">Query</option>
                  <option value="complaint">Complaint</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select name="priority" className="input" defaultValue="medium">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              {assignableUsers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To (Optional)
                  </label>
                  <select name="assigned_to" className="input">
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
                  <p className="text-xs text-gray-500 mt-1">
                    {userRole === ROLE.EMPLOYEE
                      ? 'Assign this request to a Lead or Admin'
                      : userRole === ROLE.LEAD
                        ? 'Assign this request to anyone in the company'
                        : 'Assign this request to a team member'}
                  </p>
                </div>
              )}
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? 'Creating...' : 'Create Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingColumn ? 'Edit Column' : 'Create Column'}
            </h2>
            <form onSubmit={handleColumnSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Column Name *
                  </label>
                  <input
                    type="text"
                    value={columnForm.label}
                    onChange={(e) => setColumnForm({ ...columnForm, label: e.target.value })}
                    className="input"
                    placeholder="e.g., Open, In Progress, Resolved"
                    required
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Color
                  </label>
                  <select
                    value={columnForm.color}
                    onChange={(e) => setColumnForm({ ...columnForm, color: e.target.value })}
                    className="input"
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(editingColumn)}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Delete Column
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                >
                  {editingColumn ? 'Update Column' : 'Create Column'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowColumnModal(false)
                    setEditingColumn(null)
                    setColumnForm({ label: '', color: 'badge-secondary' })
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
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
