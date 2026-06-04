import api from './axios'

export const chatAPI = {
  // Create or get conversation
  createOrGetConversation: async (participantId) => {
    const formData = new URLSearchParams()
    formData.append('participant_id', participantId)
    
    const response = await api.post('/chat/conversations', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // List conversations
  listConversations: async () => {
    const response = await api.get('/chat/conversations')
    return response.data
  },

  // Get messages
  getMessages: async (conversationId, skip = 0, limit = 50) => {
    const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
      params: { skip, limit }
    })
    return response.data
  },

  // Send text message
  sendMessage: async (conversationId, content) => {
    const formData = new URLSearchParams()
    formData.append('content', content)
    
    const response = await api.post(`/chat/conversations/${conversationId}/messages`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Send file message
  sendFile: async (conversationId, file, content = '') => {
    const formData = new FormData()
    if (content) formData.append('content', content)
    formData.append('file', file)
    
    const response = await api.post(`/chat/conversations/${conversationId}/messages`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Search users for chat
  searchUsers: async (query) => {
    const response = await api.get('/chat/users/search', {
      params: { query }
    })
    return response.data
  },

  // Mark message as read
  markMessageRead: async (messageId) => {
    const response = await api.patch(`/chat/messages/${messageId}/read`)
    return response.data
  },

  // Delete message
  deleteMessage: async (messageId) => {
    const response = await api.delete(`/chat/messages/${messageId}`)
    return response.data
  },

  // Group Management APIs
  // Create group
  createGroup: async (groupName, participantIds) => {
    const response = await api.post('/chat/groups', {
      group_name: groupName,
      participant_ids: participantIds
    })
    return response.data
  },

  // Get group details
  getGroupDetails: async (groupId) => {
    const response = await api.get(`/chat/groups/${groupId}`)
    return response.data
  },

  // Get group members
  getGroupMembers: async (groupId) => {
    const response = await api.get(`/chat/groups/${groupId}/members`)
    return response.data
  },

  // Add members to group
  addMembersToGroup: async (groupId, userIds) => {
    const response = await api.post(`/chat/groups/${groupId}/members`, {
      user_ids: userIds
    })
    return response.data
  },

  // Remove member from group
  removeMemberFromGroup: async (groupId, userId) => {
    const response = await api.delete(`/chat/groups/${groupId}/members/${userId}`)
    return response.data
  },

  // Add group admin
  addGroupAdmin: async (groupId, userId) => {
    const response = await api.post(`/chat/groups/${groupId}/admins/${userId}`)
    return response.data
  },

  // Remove group admin
  removeGroupAdmin: async (groupId, userId) => {
    const response = await api.delete(`/chat/groups/${groupId}/admins/${userId}`)
    return response.data
  },
}

