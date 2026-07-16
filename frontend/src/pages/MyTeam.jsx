import { useState, useEffect, useCallback } from 'react'
import { Users, CheckSquare, Ticket, Phone, Briefcase, Calendar, Plus, MoreVertical } from 'lucide-react'
import { usersAPI } from '../api/users'
import { useConfirmation } from '../hooks/useConfirmation'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ROLE, normalizeRole } from '../utils/roles'
import { PasswordInput, PhoneInput } from '../components/ui'

const allowedTeamRoles = [ROLE.LEAD, ROLE.ADMIN, ROLE.MANAGER, ROLE.SUPER_ADMIN]

const MyTeam = () => {
  const { user } = useAuthStore()
  const { confirm, showUndoNotification } = useConfirmation()
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openMenuFor, setOpenMenuFor] = useState(null)
  const [editingMember, setEditingMember] = useState(null)
  const normalizedRole = normalizeRole(user?.role)

  const fetchTeam = useCallback(async () => {
    try {
      setLoading(true)
      if (normalizedRole === ROLE.LEAD) {
        const data = await usersAPI.getMyTeam()
        setTeamData(data)
        return
      }

      const data = await usersAPI.listUsers(null, null, 'active', 0, 500)
      const users = Array.isArray(data?.users) ? data.users : []
      const teamMembers = users.filter((member) => {
        const memberRole = normalizeRole(member.role)
        if (member.id === user?.id) return false
        return [ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE].includes(memberRole)
      })

      setTeamData({
        team_members: teamMembers.map((member) => ({
          ...member,
          task_count: member.task_count ?? 0,
          ticket_count: member.ticket_count ?? 0,
        })),
        total: teamMembers.length,
        lead_info: {
          team_name: 'Team overview',
        },
      })
    } catch (error) {
      console.error('Error loading team:', error)
      toast.error('Failed to load team members')
      setTeamData(null)
    } finally {
      setLoading(false)
    }
  }, [normalizedRole, user?.id])

  useEffect(() => {
    if (allowedTeamRoles.includes(normalizedRole)) {
      fetchTeam()
    }
  }, [fetchTeam, normalizedRole])

  const handleAddOrUpdateMember = async (e) => {
    e.preventDefault()
    if (submitting) return

    const formData = new FormData(e.target)

    const memberPayload = {
      email: formData.get('email'),
      password: formData.get('password'),
      first_name: formData.get('first_name'),
      last_name: formData.get('last_name'),
      phone: formData.get('phone') || '',
      department: formData.get('department') || '',
      designation: formData.get('designation') || '',
    }

    try {
      setSubmitting(true)
      if (editingMember) {
        // For edit, do not send password (not supported in this flow)
        delete memberPayload.password
        await usersAPI.updateUser(editingMember.id, memberPayload)
        toast.success('Member updated')
      } else {
        // Leads auto-assign lead_id in backend
        await usersAPI.createEmployee(memberPayload)
        toast.success('Member added to your team')
      }
      setShowAddModal(false)
      setEditingMember(null)
      await fetchTeam()
      e.target.reset()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Failed to add member'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteMember = async (member) => {
    const confirmed = await confirm({
      title: 'Remove Member',
      message: `Remove ${member.first_name} ${member.last_name} from your team?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    try {
      await usersAPI.deleteUser(member.id)
      toast.success('Member removed')
      showUndoNotification({
        message: 'Member removed',
        onUndo: async () => {
          await fetchTeam()
        },
        duration: 3000,
      })
      await fetchTeam()
    } catch (error) {
      const msg = error.response?.data?.detail || 'Failed to remove member'
      toast.error(msg)
    } finally {
      setOpenMenuFor(null)
    }
  }

  if (!allowedTeamRoles.includes(normalizedRole)) {
    return (
      <div className="space-y-6">
        <div className="card text-center py-12">
          <p className="text-gray-600">This page is only available for Leads, Managers, and Admins.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Team</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your team members</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading team...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!teamData) {
    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Team</h1>
          <p className="text-sm text-gray-600 mt-1">Manage your team members</p>
        </div>
        <div className="card text-center py-12">
          <p className="text-gray-600">Failed to load team data.</p>
        </div>
      </div>
    )
  }

  const { team_members, lead_info } = teamData

  return (
    <div className="p-4 space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">My Team</h1>
          <p className="text-xs sm:text-sm font-medium text-gray-700 truncate">
            {lead_info?.team_name ? `Team: ${lead_info.team_name}` : 'Manage your team members'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingMember(null)
            setShowAddModal(true)
          }}
          className="btn btn-primary flex items-center justify-center text-sm px-3 py-1.5 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Member
        </button>
      </div>

      {/* Team Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-xs text-gray-600">Team Members</p>
              <p className="text-xl font-bold text-gray-900">{team_members.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2.5 bg-green-100 rounded-lg">
              <CheckSquare className="h-5 w-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-xs text-gray-600">Total Tasks</p>
              <p className="text-xl font-bold text-gray-900">
                {team_members.reduce((sum, member) => sum + (member.task_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center">
            <div className="p-2.5 bg-orange-100 rounded-lg">
              <Ticket className="h-5 w-5 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-xs text-gray-600">Total Tickets</p>
              <p className="text-xl font-bold text-gray-900">
                {team_members.reduce((sum, member) => sum + (member.ticket_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Members List */}
      <div className="card p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Team Members</h2>
        {team_members.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No team members yet.</p>
            <p className="text-sm text-gray-500 mt-2">
              Employees you create will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {team_members.map((member) => (
              <div
                key={member.id}
                className="relative border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-lg">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </span>
                    </div>
                    <div className="ml-3">
                      <h3 className="font-semibold text-gray-900">
                        {member.first_name} {member.last_name}
                      </h3>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>

                  {/* Card menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuFor((prev) => (prev === member.id ? null : member.id))
                      }
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical className="h-5 w-5 text-gray-500" />
                    </button>
                    {openMenuFor === member.id && (
                      <div className="absolute right-0 mt-2 w-36 rounded-lg border border-gray-200 bg-white shadow-lg z-10">
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                          onClick={() => {
                            setEditingMember(member)
                            setShowAddModal(true)
                            setOpenMenuFor(null)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteMember(member)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  {member.designation && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Briefcase className="h-4 w-4 mr-2 text-gray-400" />
                      {member.designation}
                    </div>
                  )}
                  {member.department && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2 text-gray-400" />
                      {member.department}
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Phone className="h-4 w-4 mr-2 text-gray-400" />
                      {member.phone}
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    Joined {format(new Date(member.created_at), 'MMM d, yyyy')}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{member.task_count || 0}</p>
                    <p className="text-xs text-gray-500">Tasks</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{member.ticket_count || 0}</p>
                    <p className="text-xs text-gray-500">Tickets</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingMember ? 'Edit Member' : 'Add Member'}
            </h2>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {editingMember
                  ? 'Update details for this team member.'
                  : 'Employees you create here will be auto-assigned to your team.'}
              </p>
            </div>
            <form onSubmit={handleAddOrUpdateMember} className="space-y-4" autoComplete="off">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  required
                  autoComplete="off"
                  className="input"
                  placeholder="Enter first name"
                  defaultValue={editingMember?.first_name || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="last_name"
                  required
                  autoComplete="off"
                  className="input"
                  placeholder="Enter last name"
                  defaultValue={editingMember?.last_name || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="new-password"
                  className="input"
                  placeholder="Enter email address"
                  defaultValue={editingMember?.email || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingMember ? '(leave blank to keep current)' : '*'}
                </label>
                <PasswordInput
                  name="password"
                  required={!editingMember}
                  minLength={8}
                  autoComplete="new-password"
                  className="input"
                  placeholder="Enter password (min 8 characters)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <PhoneInput
                  name="phone"
                  className="input"
                  placeholder="+919876543210"
                  defaultValue={editingMember?.phone || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  name="department"
                  className="input"
                  placeholder="Engineering"
                  defaultValue={editingMember?.department || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  name="designation"
                  className="input"
                  placeholder="Software Developer"
                  defaultValue={editingMember?.designation || ''}
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting
                    ? editingMember ? 'Saving...' : 'Adding...'
                    : editingMember ? 'Save Changes' : 'Add Member'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingMember(null)
                  }}
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
    </div>
  )
}

export default MyTeam

