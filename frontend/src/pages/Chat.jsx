import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Paperclip, Search, X, File as FileIcon, Users, Settings, MessageCircle, ArrowLeft } from 'lucide-react'
import { chatAPI } from '../api/chat'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import GroupModal from '../components/GroupModal'

const Chat = () => {
  const { user } = useAuthStore()
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearch, setShowSearch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [fileInput, setFileInput] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupModalMode, setGroupModalMode] = useState('create')
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // Scroll to bottom - only scroll if at bottom or when new message is sent
  const scrollToBottom = useCallback((force = false) => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        if (force || isNearBottom) {
          messagesEndRef.current.scrollIntoView({ behavior: force ? 'smooth' : 'auto' })
        }
      }
    }
  }, [])

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await chatAPI.listConversations()
      const newConversations = data.conversations || []
      
      // Only update if conversations have actually changed
      setConversations(prevConversations => {
        if (prevConversations.length !== newConversations.length) {
          return newConversations
        }
        // Check if any conversation changed (unread count, last message, etc.)
        const hasChanged = prevConversations.some((prevConv, idx) => {
          const newConv = newConversations[idx]
          return !newConv || 
                 prevConv.id !== newConv.id ||
                 prevConv.unread_count !== newConv.unread_count ||
                 prevConv.last_message !== newConv.last_message ||
                 prevConv.last_message_at !== newConv.last_message_at
        })
        return hasChanged ? newConversations : prevConversations
      })
    } catch (error) {
      console.error('Error loading conversations:', error)
      // Don't show error toast on polling
    }
  }, [])

  // Load messages for selected conversation
  const loadMessages = useCallback(async (conversationId, isInitialLoad = false) => {
    try {
      const data = await chatAPI.getMessages(conversationId)
      const newMessages = data.messages || []
      
      // Only update if messages have actually changed
      setMessages(prevMessages => {
        if (prevMessages.length === 0) {
          return newMessages // Initial load
        }
        
        // Compare message IDs to check if anything changed
        const prevIds = prevMessages.map(m => m.id).join(',')
        const newIds = newMessages.map(m => m.id).join(',')
        
        // If IDs are exactly the same, don't update (prevent re-render)
        if (prevIds === newIds && prevMessages.length === newMessages.length) {
          // Double check content hasn't changed
          let hasContentChange = false
          for (let i = 0; i < prevMessages.length; i++) {
            if (prevMessages[i].content !== newMessages[i].content) {
              hasContentChange = true
              break
            }
          }
          if (!hasContentChange) {
            return prevMessages // No change at all, keep previous
          }
        }
        
        // New message added
        if (newMessages.length > prevMessages.length) {
          setTimeout(() => scrollToBottom(false), 100)
        }
        
        return newMessages
      })
      
      // Only scroll on initial load
      if (isInitialLoad) {
        setTimeout(() => scrollToBottom(true), 100)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
      // Don't show error toast on polling
    }
  }, [scrollToBottom])

  // Search users
  const searchUsers = async (query) => {
    if (query.length < 1) {
      setSearchResults([])
      return
    }
    try {
      const data = await chatAPI.searchUsers(query)
      setSearchResults(data.users || [])
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }

  // Start new conversation
  const startConversation = async (participantId) => {
    try {
      const data = await chatAPI.createOrGetConversation(participantId)
      setSelectedConversation(data)
      setShowSearch(false)
      setSearchQuery('')
      await loadMessages(data.id)
      await loadConversations()
    } catch (error) {
      toast.error('Failed to start conversation')
    }
  }

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault()
    if (!selectedConversation || (!messageInput.trim() && !fileInput)) return
    if (sending) return

    try {
      setSending(true)
      
      if (fileInput) {
        await chatAPI.sendFile(selectedConversation.id, fileInput, messageInput)
        setFileInput(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        await chatAPI.sendMessage(selectedConversation.id, messageInput)
      }
      
      setMessageInput('')
      await loadMessages(selectedConversation.id, false)
      await loadConversations()
      setTimeout(() => scrollToBottom(true), 100)
    } catch (error) {
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB')
        return
      }
      setFileInput(file)
    }
  }

  // Poll for new messages - only update if there are changes
  useEffect(() => {
    if (!selectedConversation?.id) return

    let pollCount = 0
    const interval = setInterval(() => {
      pollCount++
      loadMessages(selectedConversation.id)
      // Reload conversations less frequently (every 3rd poll) to reduce blinking
      if (pollCount % 3 === 0) {
        loadConversations()
      }
    }, 8000) // Poll every 8 seconds (reduced to minimize blinking)

    return () => clearInterval(interval)
  }, [selectedConversation?.id, loadMessages, loadConversations])

  // Initial load
  useEffect(() => {
    const initialLoad = async () => {
      try {
        setLoading(true)
        await loadConversations()
      } catch (error) {
        console.error('Error loading conversations on mount:', error)
        toast.error('Failed to load conversations')
      } finally {
        setLoading(false)
      }
    }
    initialLoad()
  }, [loadConversations])

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation?.id) {
      loadMessages(selectedConversation.id, true) // Initial load
    } else {
      setMessages([]) // Clear messages when no conversation selected
    }
  }, [selectedConversation?.id, loadMessages])

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchUsers(searchQuery)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Get other participant name
  const getOtherParticipant = (conversation) => {
    if (conversation.is_group) {
      return null // Groups don't have "other participant"
    }
    if (conversation.participants && conversation.participants.length > 0) {
      return conversation.participants[0]
    }
    return null
  }

  // Handle group created
  const handleGroupCreated = async (groupData) => {
    await loadConversations()
    setSelectedConversation({
      id: groupData.id,
      is_group: true,
      group_name: groupData.group_name,
      participants: groupData.participants,
    })
    await loadMessages(groupData.id, true)
  }

  // Handle group updated
  const handleGroupUpdated = async () => {
    await loadConversations()
    if (selectedConversation?.id) {
      await loadMessages(selectedConversation.id)
    }
  }

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Get avatar URL
  const getAvatarUrl = (avatar) => {
    if (!avatar) return null
    if (avatar.startsWith('http')) return avatar
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'
    return `${apiUrl}${avatar}`
  }

  // Render avatar component
  const renderAvatar = (avatar, name, size = 'md') => {
    const sizeClasses = {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base'
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--color-app-bg)]">
      {/* Conversations Sidebar */}
      <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} h-full min-h-0 w-full flex-none flex-col border-r border-[var(--color-app-border)] bg-[var(--color-app-surface)] md:w-80`}>
        {/* Header */}
        <div className="relative border-b border-[var(--color-app-border)] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-[var(--color-app-text)]">Messages</h2>
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => {
                  setGroupModalMode('create')
                  setShowGroupModal(true)
                }}
                className="app-icon-button"
                title="Create Group"
              >
                <Users className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="app-icon-button"
                title="New Chat"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (
            <div className="relative">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3.5 py-2.5 text-sm text-[var(--color-app-text)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="absolute right-2 top-2 text-[var(--color-app-text-muted)] hover:text-[var(--color-app-accent)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Search Results */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute inset-x-0 z-10 mt-2 max-h-64 overflow-y-auto rounded-xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-[var(--color-app-shadow)]">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => startConversation(user.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-app-accent-soft)]"
                >
                  {renderAvatar(user.avatar, user.name, 'md')}
                  <div>
                    <div className="font-semibold text-[var(--color-app-text)]">{user.name}</div>
                    <div className="text-xs text-[var(--color-app-text-muted)] capitalize">{user.role.replace('_', ' ')}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversations List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-10 text-center text-[var(--color-app-text-muted)]">
              <p>No conversations yet</p>
              <p className="text-sm mt-2">Search for a user to start chatting</p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const otherParticipant = getOtherParticipant(conversation)
              const isGroup = conversation.is_group
              return (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation)}
                  className={`flex w-full items-center gap-3 border-b border-[var(--color-app-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-app-accent-soft)] ${
                    selectedConversation?.id === conversation.id ? 'bg-primary-50 dark:bg-primary-950/50' : ''
                  }`}
                >
                  {isGroup ? (
                    <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-6 w-6 text-primary-600" />
                    </div>
                  ) : (
                    renderAvatar(otherParticipant?.avatar, otherParticipant?.name, 'lg')
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 truncate font-semibold text-[var(--color-app-text)]">
                        {isGroup ? (
                          <>
                            <span>{conversation.group_name}</span>
                            <span className="text-xs text-[var(--color-app-text-muted)]">({conversation.participants?.length || 0})</span>
                          </>
                        ) : (
                          <span>{otherParticipant?.name || 'Unknown User'}</span>
                        )}
                      </div>
                      {conversation.unread_count > 0 && (
                        <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full">
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-[var(--color-app-text-muted)]">
                      {conversation.last_message || 'No messages yet'}
                    </div>
                    {conversation.last_message_at && (
                      <div className="mt-1 text-xs text-[var(--color-app-text-muted)]">
                        {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`${selectedConversation ? 'flex' : 'hidden md:flex'} h-full min-h-0 min-w-0 flex-1 flex-col`}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-3 sm:px-6 sm:py-4">
              {(() => {
                const otherParticipant = getOtherParticipant(selectedConversation)
                const isGroup = selectedConversation?.is_group
                return (
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedConversation(null)}
                        className="app-icon-button md:hidden"
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>
                      {isGroup ? (
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary-600" />
                        </div>
                      ) : (
                        renderAvatar(otherParticipant?.avatar, otherParticipant?.name, 'md')
                      )}
                      <div>
                        <div className="truncate font-semibold text-[var(--color-app-text)]">
                          {isGroup ? selectedConversation.group_name : (otherParticipant?.name || 'Unknown User')}
                        </div>
                        <div className="text-xs text-[var(--color-app-text-muted)] capitalize">
                          {isGroup ? (
                            <span>{selectedConversation.participants?.length || 0} members</span>
                          ) : (
                            <span>{otherParticipant?.role?.replace('_', ' ') || ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isGroup && (
                      <button
                        onClick={() => {
                          setGroupModalMode('manage')
                          setShowGroupModal(true)
                        }}
                        className="app-icon-button"
                        title="Manage Group"
                      >
                        <Settings className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:p-6">
              {messages.map((message) => {
                const isOwn = message.sender_id === user?.id
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[82vw] sm:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                      {!isOwn && (
                        <div className="mb-1 px-2 text-xs text-[var(--color-app-text-muted)]">
                          {message.sender_name}
                        </div>
                      )}
                      <div
                        className={`rounded-lg px-4 py-2 ${
                          isOwn
                            ? 'bg-primary-600 text-white'
                            : 'border border-[var(--color-app-border)] bg-[var(--color-app-surface)] text-[var(--color-app-text)]'
                        }`}
                      >
                        {message.message_type === 'file' && (
                          <div className="mb-2">
                            <a
                              href={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'}${message.file_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center space-x-2 text-sm hover:underline"
                            >
                              <FileIcon className="h-4 w-4" />
                              <span>{message.file_name}</span>
                              <span className="text-xs opacity-75">
                                ({formatFileSize(message.file_size)})
                              </span>
                            </a>
                          </div>
                        )}
                        {message.message_type === 'image' && (
                          <div className="mb-2">
                            <img
                              src={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'}${message.file_url}`}
                              alt={message.file_name}
                              className="max-w-full rounded-lg"
                              style={{ maxHeight: '300px' }}
                            />
                          </div>
                        )}
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                        <div className={`mt-1 text-xs ${isOwn ? 'text-primary-100' : 'text-[var(--color-app-text-muted)]'}`}>
                          {format(new Date(message.created_at), 'HH:mm')}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* File Preview */}
            {fileInput && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-app-border)] bg-[var(--color-app-surface-muted)] px-3 py-2 sm:px-6">
                <div className="flex min-w-0 items-center gap-2">
                  <FileIcon className="h-4 w-4 text-gray-600" />
                  <span className="truncate text-sm text-[var(--color-app-text-secondary)]">{fileInput.name}</span>
                  <span className="text-xs text-[var(--color-app-text-muted)]">({formatFileSize(fileInput.size)})</span>
                </div>
                <button
                  onClick={() => {
                    setFileInput(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-[var(--color-app-text-muted)] hover:text-[var(--color-app-accent)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Message Input */}
            <form onSubmit={sendMessage} className="border-t border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-3 sm:px-6 sm:py-4">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="app-icon-button"
                  title="Attach File"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  rows={1}
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-[var(--color-app-border)] bg-[var(--color-app-surface-muted)] px-3.5 py-2.5 text-sm text-[var(--color-app-text)] outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(e)
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || (!messageInput.trim() && !fileInput)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-200/50 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-primary-950/30"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="hidden flex-1 items-center justify-center p-6 md:flex">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300"><MessageCircle className="h-8 w-8" /></div>
              <h3 className="mb-2 text-xl font-semibold text-[var(--color-app-text)]">Select a conversation</h3>
              <p className="text-[var(--color-app-text-muted)]">Choose a conversation from the sidebar or start a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        mode={groupModalMode}
        groupId={groupModalMode === 'manage' ? selectedConversation?.id : null}
        onGroupCreated={handleGroupCreated}
        onGroupUpdated={handleGroupUpdated}
      />
    </div>
  )
}

export default Chat








