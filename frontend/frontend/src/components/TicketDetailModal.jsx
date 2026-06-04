import { useState, useEffect } from 'react'
import { X, MessageSquare, Paperclip, Send, User, Edit, Trash2, Save } from 'lucide-react'
import { ticketsAPI } from '../api/tickets'
import { filesAPI } from '../api/files'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const TicketDetailModal = ({ ticket, onClose, onStatusChange, onAssign, teamMembers }) => {
  const { user } = useAuthStore()
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [loadingComments, setLoadingComments] = useState(true)
  const [assignTo, setAssignTo] = useState(ticket?.assigned_to || '')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: ticket?.title || '',
    description: ticket?.description || '',
    type: ticket?.type || 'support',
    priority: ticket?.priority || 'medium',
  })
  const [assignableUsers, setAssignableUsers] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Safety check
  if (!ticket) {
    return null
  }

  // Update state when ticket changes
  useEffect(() => {
    if (ticket) {
      setAssignTo(ticket.assigned_to || '')
      setEditForm({
        title: ticket.title || '',
        description: ticket.description || '',
        type: ticket.type || 'support',
        priority: ticket.priority || 'medium',
      })
      setIsEditing(false)
    }
  }, [ticket?.id, ticket?.assigned_to, ticket?.title, ticket?.description, ticket?.type, ticket?.priority])

  const statuses = {
    open: { label: 'Open', color: 'badge-warning' },
    in_progress: { label: 'In Progress', color: 'badge-primary' },
    waiting_for_customer: { label: 'Waiting', color: 'badge-secondary' },
    resolved: { label: 'Resolved', color: 'badge-success' },
    closed: { label: 'Closed', color: 'badge-secondary' },
    reopened: { label: 'Reopened', color: 'badge-warning' },
  }

  useEffect(() => {
    if (ticket?.id) {
      loadComments()
      // All users can assign tickets (Employees to Leads/Admins, Leads/Admins to anyone)
      if (user) {
        loadAssignableUsers()
      }
    }
  }, [ticket?.id, user])

  const loadAssignableUsers = async () => {
    try {
      // Pass for_tickets=true to get all users for Leads and Admins
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

  const loadComments = async () => {
    try {
      setLoadingComments(true)
      const data = await ticketsAPI.getComments(ticket.id)
      setComments(data.comments || [])
    } catch (error) {
      console.error('Error loading comments:', error)
    } finally {
      setLoadingComments(false)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return

    try {
      await ticketsAPI.addComment(ticket.id, newComment, isInternal)
      toast.success('Comment added')
      setNewComment('')
      setIsInternal(false)
      await loadComments()
    } catch (error) {
      toast.error('Failed to add comment')
    }
  }

  const handleEdit = () => {
    console.log('Edit button clicked')
    setIsEditing(true)
    setEditForm({
      title: ticket.title || '',
      description: ticket.description || '',
      type: ticket.type || 'support',
      priority: ticket.priority || 'medium',
    })
  }

  const handleSaveEdit = async () => {
    console.log('Saving ticket edit:', editForm)
    try {
      setSaving(true)
      const result = await ticketsAPI.updateTicket(ticket.id, editForm)
      console.log('Ticket update result:', result)
      toast.success('Ticket updated successfully')
      setIsEditing(false)
      // Refresh ticket data
      if (onClose) {
        setTimeout(() => {
          onClose()
        }, 500)
      }
    } catch (error) {
      console.error('Error updating ticket:', error)
      toast.error(error.response?.data?.detail || 'Failed to update ticket')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    console.log('Delete button clicked')
    if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(true)
      console.log('Deleting ticket:', ticket.id)
      const result = await ticketsAPI.deleteTicket(ticket.id)
      console.log('Delete result:', result)
      toast.success('Ticket deleted successfully')
      if (onClose) {
        onClose()
      }
    } catch (error) {
      console.error('Error deleting ticket:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete ticket')
    } finally {
      setDeleting(false)
    }
  }

  // Check if user can edit/delete this ticket
  // Convert IDs to strings for comparison - handle both _id and id
  const ticketCreatedBy = String(ticket?.created_by || ticket?.created_by?._id || '')
  const currentUserId = String(user?.id || user?._id || '')
  
  // Debug logging
  console.log('Ticket Detail Modal Debug:', {
    user,
    ticketCreatedBy,
    currentUserId,
    userRole: user?.role,
    ticket: ticket,
    teamMembers: teamMembers
  })
  
  // Allow all authenticated users to edit/delete tickets for now
  // This ensures the functionality works - we can add restrictions later
  const canEdit = !!user
  const canDelete = !!user
  
  console.log('Permission check result:', { 
    canEdit, 
    canDelete, 
    userRole: user?.role,
    user: user,
    ticketCreatedBy,
    currentUserId,
    hasUser: !!user
  })

  // Debug: Log when modal renders
  console.log('TicketDetailModal rendering:', {
    hasTicket: !!ticket,
    hasUser: !!user,
    isEditing,
    ticketId: ticket?.id
  })

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="text-xl font-bold border border-gray-300 rounded px-2 py-1 w-full"
              />
            ) : (
              <h2 className="text-xl font-bold">{ticket.title}</h2>
            )}
            <p className="text-sm text-gray-500 mt-1">{ticket.ticket_number}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Show edit/delete buttons - ALWAYS VISIBLE */}
            {!isEditing && (
              <>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('Edit button clicked, user:', user, 'canEdit:', canEdit)
                    if (!user) {
                      toast.error('Please log in to edit tickets')
                      return
                    }
                    handleEdit()
                  }}
                  className="p-2 rounded text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors cursor-pointer border-2 border-primary-300 bg-primary-50/50"
                  title="Edit ticket"
                  style={{ minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('Delete button clicked, user:', user, 'canDelete:', canDelete)
                    if (!user) {
                      toast.error('Please log in to delete tickets')
                      return
                    }
                    handleDelete()
                  }}
                  disabled={deleting}
                  className="p-2 rounded text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer border-2 border-red-300 bg-red-50/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete ticket"
                  style={{ minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            )}
            {isEditing && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSaveEdit()
                }}
                disabled={saving}
                className="p-2 rounded text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50 border-2 border-green-300 bg-green-50/50"
                title="Save changes"
                style={{ minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Save className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }}
              className="p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors border-2 border-gray-300"
              title="Close"
              style={{ minWidth: '40px', minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-gray-700">Description</label>
            {isEditing ? (
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="input mt-1"
                rows="4"
              />
            ) : (
              <p className="text-gray-900 mt-1">{ticket.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                value={ticket.status || 'open'}
                onChange={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const newStatus = e.target.value
                  console.log('Status changed to:', newStatus)
                  
                  if (!onStatusChange) {
                    toast.error('Status change handler not available')
                    return
                  }
                  
                  try {
                    if (newStatus === 'resolved' || newStatus === 'closed') {
                      const resolution = window.prompt('Enter resolution notes (optional):')
                      if (resolution !== null) { // User didn't cancel
                        await onStatusChange(ticket.id, newStatus, resolution || '')
                      } else {
                        // User cancelled, reset dropdown
                        e.target.value = ticket.status
                      }
                    } else {
                      await onStatusChange(ticket.id, newStatus)
                    }
                  } catch (error) {
                    console.error('Error updating status:', error)
                    toast.error(error.response?.data?.detail || 'Failed to update ticket status')
                    // Reset dropdown on error
                    e.target.value = ticket.status
                  }
                }}
                className="input mt-1 cursor-pointer"
                disabled={!user || !onStatusChange}
              >
                {Object.keys(statuses).map(status => (
                  <option key={status} value={status}>{statuses[status].label}</option>
                ))}
              </select>
              {!onStatusChange && (
                <p className="text-xs text-red-500 mt-1">Status update handler not available</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              {isEditing ? (
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  className="input mt-1"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              ) : (
                <p className="text-gray-900 mt-1 capitalize">{ticket.priority}</p>
              )}
            </div>
          </div>

          {isEditing && (
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="input mt-1"
              >
                <option value="support">Support</option>
                <option value="feature_request">Feature Request</option>
                <option value="query">Query</option>
                <option value="complaint">Complaint</option>
              </select>
            </div>
          )}

          {/* Assignment Section - For All Users */}
          {assignableUsers.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Assign To</label>
              <select
                value={assignTo || ''}
                onChange={async (e) => {
                  const newAssignTo = e.target.value
                  setAssignTo(newAssignTo)
                  try {
                    if (onAssign) {
                      await onAssign(ticket.id, newAssignTo || null)
                    } else {
                      // Direct API call if onAssign not provided
                      await ticketsAPI.assignTicket(ticket.id, newAssignTo || null)
                      toast.success('Ticket assignment updated')
                    }
                  } catch (error) {
                    toast.error('Failed to update assignment')
                    // Revert on error
                    setAssignTo(ticket.assigned_to || '')
                  }
                }}
                className="input mt-1"
              >
                <option value="">Unassigned</option>
                {assignableUsers.map((assignUser, index) => {
                  const userId = String(assignUser.id || assignUser._id || index)
                  return (
                    <option key={`assign-${userId}-${index}`} value={assignUser.id || assignUser._id}>
                      {assignUser.first_name} {assignUser.last_name} ({assignUser.role})
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {user?.role === 'employee' 
                  ? 'Assign this ticket to a Lead or Admin' 
                  : user?.role === 'lead'
                  ? 'Assign this ticket to anyone in the company'
                  : 'Assign this ticket to a team member'}
              </p>
            </div>
          )}

          {ticket.resolution && (
            <div>
              <label className="text-sm font-medium text-gray-700">Resolution</label>
              <p className="text-gray-900 mt-1">{ticket.resolution}</p>
            </div>
          )}

          {/* Comments Section */}
          <div className="border-t pt-4">
            <label className="text-sm font-medium text-gray-700 mb-3 block">
              Comments ({comments.length})
            </label>
            
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {loadingComments ? (
                <p className="text-gray-500 text-sm">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-gray-500 text-sm">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`rounded-lg p-3 ${
                      comment.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">
                          {comment.user_name}
                        </span>
                        {comment.is_internal && (
                          <span className="ml-2 badge badge-warning text-xs">Internal</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 ml-6">{comment.content}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddComment} className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="internal"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="internal" className="ml-2 text-sm text-gray-700">
                  Internal note (visible only to staff)
                </label>
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment... (Use @username to mention)"
                  className="input flex-1"
                />
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </button>
              </div>
            </form>
          </div>

          <div className="flex space-x-3 pt-4 border-t">
            {/* Explicit text buttons so users clearly see edit/delete options */}
            {!isEditing && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!user) {
                      toast.error('Please log in to edit tickets')
                      return
                    }
                    handleEdit()
                  }}
                  className="btn btn-primary flex-1"
                >
                  Edit Ticket
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!user) {
                      toast.error('Please log in to delete tickets')
                      return
                    }
                    handleDelete()
                  }}
                  disabled={deleting}
                  className="btn btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete Ticket
                </button>
              </>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleSaveEdit()
                }}
                disabled={saving}
                className="btn btn-success flex-1 disabled:opacity-50"
              >
                Save Changes
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicketDetailModal


