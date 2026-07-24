import { useState, useEffect, useCallback } from 'react'
import { X, Search, UserPlus, UserMinus, Shield, ShieldOff } from 'lucide-react'
import { chatAPI } from '../api/chat'
import { useConfirmation } from '../hooks/useConfirmation'
import toast from 'react-hot-toast'

const GroupModal = ({ isOpen, onClose, mode = 'create', groupId = null, onGroupCreated, onGroupUpdated }) => {
  const { confirm } = useConfirmation()
  const [groupName, setGroupName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [groupAdmins, setGroupAdmins] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)

  // Get avatar URL
  const getAvatarUrl = (avatar) => {
    if (!avatar) return null
    if (avatar.startsWith('http')) return avatar
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''
    if (avatar.startsWith('/uploads/avatars/')) return `${apiUrl}/api/v1${avatar}`
    return `${apiUrl}${avatar}`
  }

  // Render avatar component
  const renderAvatar = (avatar, name, size = 'md') => {
    const sizeClasses = {
      sm: 'h-6 w-6 text-xs',
      md: 'h-8 w-8 text-xs',
      lg: 'h-10 w-10 text-sm'
    }
    const sizeClass = sizeClasses[size] || sizeClasses.md
    const avatarUrl = getAvatarUrl(avatar)
    const initials = name?.split(' ').map(n => n[0]).join('') || 'U'

    return (
      <div className={`${sizeClass.split(' ')[0]} ${sizeClass.split(' ')[1]} rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 relative`}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className={`${sizeClass.split(' ')[0]} ${sizeClass.split(' ')[1]} rounded-full object-cover`}
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <span className={`text-primary-600 font-semibold ${sizeClass.split(' ')[2]} ${avatarUrl ? 'hidden' : ''}`}>
          {initials}
        </span>
      </div>
    )
  }

  // Load group details if editing
  const loadGroupDetails = useCallback(async () => {
    try {
      setLoading(true)
      const data = await chatAPI.getGroupDetails(groupId)
      setGroupName(data.group_name)
      setGroupMembers(data.participants || [])
      setGroupAdmins(data.group_admins || [])
    } catch (error) {
      toast.error('Failed to load group details')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [groupId])

  const searchUsers = useCallback(async (query) => {
    if (query.length < 1) {
      setSearchResults([])
      return
    }
    try {
      const data = await chatAPI.searchUsers(query)
      // Filter out already selected users and current group members
      const memberIds = new Set([
        ...selectedUsers.map(u => u.id),
        ...groupMembers.map(m => m.id)
      ])
      setSearchResults(data.users.filter(user => !memberIds.has(user.id)))
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }, [groupMembers, selectedUsers])

  useEffect(() => {
    if (isOpen && mode === 'manage' && groupId) {
      loadGroupDetails()
    } else if (isOpen && mode === 'create') {
      // Reset form for create mode
      setGroupName('')
      setSelectedUsers([])
      setSearchQuery('')
      setSearchResults([])
      setGroupMembers([])
      setGroupAdmins([])
      setShowAddMembers(false)
    }
  }, [isOpen, mode, groupId, loadGroupDetails])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchUsers(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, searchUsers])

  const handleAddUser = (user) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user])
      setSearchQuery('')
      setSearchResults([])
    }
  }

  const handleRemoveUser = (userId) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId))
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name')
      return
    }

    if (selectedUsers.length === 0) {
      toast.error('Please select at least one member')
      return
    }

    try {
      setCreating(true)
      const data = await chatAPI.createGroup(
        groupName.trim(),
        selectedUsers.map(u => u.id)
      )
      toast.success('Group created successfully')
      onGroupCreated?.(data)
      onClose()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create group')
      console.error(error)
    } finally {
      setCreating(false)
    }
  }

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one member to add')
      return
    }

    try {
      setCreating(true)
      await chatAPI.addMembersToGroup(groupId, selectedUsers.map(u => u.id))
      toast.success('Members added successfully')
      await loadGroupDetails()
      setSelectedUsers([])
      setShowAddMembers(false)
      setSearchQuery('')
      onGroupUpdated?.()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add members')
      console.error(error)
    } finally {
      setCreating(false)
    }
  }

  const handleRemoveMember = async (userId, userName) => {
    const confirmed = await confirm({
      title: 'Remove Member',
      message: `Are you sure you want to remove ${userName} from the group?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) {
      return
    }

    try {
      await chatAPI.removeMemberFromGroup(groupId, userId)
      toast.success('Member removed successfully')
      await loadGroupDetails()
      onGroupUpdated?.()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove member')
      console.error(error)
    }
  }

  const handleToggleAdmin = async (userId, isAdmin) => {
    try {
      if (isAdmin) {
        await chatAPI.removeGroupAdmin(groupId, userId)
        toast.success('Admin removed successfully')
      } else {
        await chatAPI.addGroupAdmin(groupId, userId)
        toast.success('Admin added successfully')
      }
      await loadGroupDetails()
      onGroupUpdated?.()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update admin status')
      console.error(error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'create' ? 'Create New Group' : 'Manage Group'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              {/* Group Name */}
              {mode === 'create' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name *
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    maxLength={100}
                  />
                </div>
              )}

              {mode === 'manage' && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{groupName}</h3>
                  <p className="text-sm text-gray-500">{groupMembers.length} members</p>
                </div>
              )}

              {/* Add Members Section */}
              {(mode === 'create' || showAddMembers) && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {mode === 'create' ? 'Add Members' : 'Add New Members'}
                  </label>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  {/* Search Results Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="border-2 border-primary-300 bg-white rounded-lg shadow-lg max-h-56 overflow-y-auto mb-3">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleAddUser(user)}
                          className="w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center space-x-3 border-b border-gray-100 last:border-b-0 transition-colors"
                        >
                          {renderAvatar(user.avatar, user.name, 'md')}
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{user.name}</div>
                            <div className="text-xs text-gray-500 capitalize">
                              {user.role.replace('_', ' ')}
                            </div>
                          </div>
                          <UserPlus className="h-4 w-4 text-primary-600" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected Users */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center space-x-2 bg-primary-100 text-primary-700 px-3 py-1 rounded-full"
                        >
                          <span className="text-sm font-medium">{user.name}</span>
                          <button
                            onClick={() => handleRemoveUser(user.id)}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Group Members List (Manage Mode) */}
              {mode === 'manage' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Members</h3>
                    {!showAddMembers && (
                      <button
                        onClick={() => setShowAddMembers(true)}
                        className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>Add Members</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {groupMembers.map((member) => {
                      const isAdmin = groupAdmins.includes(member.id)
                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            {renderAvatar(member.avatar, member.name, 'lg')}
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-gray-900">{member.name}</span>
                                {isAdmin && (
                                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full flex items-center space-x-1">
                                    <Shield className="h-3 w-3" />
                                    <span>Admin</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 capitalize">
                                {member.role.replace('_', ' ')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleAdmin(member.id, isAdmin)}
                              className="p-2 text-gray-600 hover:bg-gray-200 rounded-lg"
                              title={isAdmin ? 'Remove admin' : 'Make admin'}
                            >
                              {isAdmin ? (
                                <ShieldOff className="h-4 w-4" />
                              ) : (
                                <Shield className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleRemoveMember(member.id, member.name)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Remove member"
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          {showAddMembers && mode === 'manage' && (
            <button
              onClick={() => {
                setShowAddMembers(false)
                setSelectedUsers([])
                setSearchQuery('')
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            {mode === 'manage' ? 'Close' : 'Cancel'}
          </button>
          {mode === 'create' && (
            <button
              onClick={handleCreateGroup}
              disabled={creating || !groupName.trim() || selectedUsers.length === 0}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          )}
          {showAddMembers && mode === 'manage' && (
            <button
              onClick={handleAddMembers}
              disabled={creating || selectedUsers.length === 0}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Adding...' : 'Add Members'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default GroupModal
