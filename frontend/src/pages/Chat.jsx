import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Paperclip, Search, X, File as FileIcon, Users, Settings, ChevronDown, MoreVertical, Smile, Phone, Video, Info } from 'lucide-react'
import { chatAPI } from '../api/chat'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow } from 'date-fns'
import GroupModal from '../components/GroupModal'
import { timeService } from '@/services/timeService'

const parseChatTimestamp = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  const timestamp = String(value)
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp)
  return new Date(hasTimezone ? timestamp : `${timestamp}Z`)
}

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
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)

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
      
      setConversations(prevConversations => {
        if (prevConversations.length !== newConversations.length) {
          return newConversations
        }
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
    }
  }, [])

  // Load messages for selected conversation
  const loadMessages = useCallback(async (conversationId, isInitialLoad = false) => {
    try {
      const data = await chatAPI.getMessages(conversationId)
      const newMessages = data.messages || []
      
      setMessages(prevMessages => {
        if (prevMessages.length === 0) {
          return newMessages
        }
        
        const prevIds = prevMessages.map(m => m.id).join(',')
        const newIds = newMessages.map(m => m.id).join(',')
        
        if (prevIds === newIds && prevMessages.length === newMessages.length) {
          let hasContentChange = false
          for (let i = 0; i < prevMessages.length; i++) {
            if (prevMessages[i].content !== newMessages[i].content) {
              hasContentChange = true
              break
            }
          }
          if (!hasContentChange) {
            return prevMessages
          }
        }
        
        if (newMessages.length > prevMessages.length) {
          setTimeout(() => scrollToBottom(false), 100)
        }
        
        return newMessages
      })
      
      if (isInitialLoad) {
        setTimeout(() => scrollToBottom(true), 100)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
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
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB')
        return
      }
      setFileInput(file)
    }
  }

  // Poll for new messages
  useEffect(() => {
    if (!selectedConversation?.id) return

    let pollCount = 0
    const interval = setInterval(() => {
      pollCount++
      loadMessages(selectedConversation.id)
      if (pollCount % 3 === 0) {
        loadConversations()
      }
    }, 8000)

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
      loadMessages(selectedConversation.id, true)
    } else {
      setMessages([])
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
      return null
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
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''
    if (avatar.startsWith('/uploads/avatars/')) return `${apiUrl}/api/v1${avatar}`
    return `${apiUrl}${avatar}`
  }

  // Render avatar component
  const renderAvatar = (avatar, name, size = 'md', status = null) => {
    const sizeClasses = {
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-14 w-14 text-lg'
    }
    const sizeClass = sizeClasses[size] || sizeClasses.md
    const avatarUrl = getAvatarUrl(avatar)
    const initials = name?.split(' ').map(n => n[0]).join('') || 'U'

    return (
      <div className="relative inline-block">
        <div className={`${sizeClass.split(' ')[0]} ${sizeClass.split(' ')[1]} rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20`}>
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
          <span className={`text-white font-semibold ${sizeClass.split(' ')[2]} ${avatarUrl ? 'hidden' : ''}`}>
            {initials}
          </span>
        </div>
        {status && (
          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-800 ${
            status === 'online' ? 'bg-emerald-500' :
            status === 'away' ? 'bg-amber-500' :
            'bg-gray-400'
          }`} />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-gray-50 dark:bg-black">
      {/* Conversations Sidebar */}
      <div className="flex w-80 min-w-0 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Messages</h2>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  setGroupModalMode('create')
                  setShowGroupModal(true)
                }}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
                title="Create Group"
              >
                <Users className="h-5 w-5" />
              </button>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
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
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pl-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Search Results */}
          {showSearch && searchResults.length > 0 && (
            <div className="absolute z-10 w-[280px] mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => startConversation(user.id)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors dark:hover:bg-gray-800"
                >
                  {renderAvatar(user.avatar, user.name, 'md')}
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{user.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user.role?.replace('_', ' ') || 'User'}</div>
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
              <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No conversations yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Search for a user to start chatting</p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const otherParticipant = getOtherParticipant(conversation)
              const isGroup = conversation.is_group
              const isActive = selectedConversation?.id === conversation.id
              return (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation)}
                  className={`w-full px-4 py-3 text-left flex items-center space-x-3 border-b border-gray-100 transition-colors dark:border-gray-800 ${
                    isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-950/30' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {isGroup ? (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                  ) : (
                    renderAvatar(otherParticipant?.avatar, otherParticipant?.name, 'lg', 'online')
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="font-semibold text-gray-900 dark:text-white truncate flex items-center space-x-2">
                        {isGroup ? (
                          <>
                            <span>{conversation.group_name}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">({conversation.participants?.length || 0})</span>
                          </>
                        ) : (
                          <span>{otherParticipant?.name || 'Unknown User'}</span>
                        )}
                      </div>
                      {conversation.unread_count > 0 && (
                        <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center">
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {conversation.last_message || 'No messages yet'}
                    </div>
                    {conversation.last_message_at && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {formatDistanceToNow(parseChatTimestamp(conversation.last_message_at), { addSuffix: true })}
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
      <div className="flex min-w-0 flex-1 flex-col bg-gray-50 dark:bg-black">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm dark:bg-gray-900 dark:border-gray-700">
              {(() => {
                const otherParticipant = getOtherParticipant(selectedConversation)
                const isGroup = selectedConversation?.is_group
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {isGroup ? (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                          <Users className="h-5 w-5 text-white" />
                        </div>
                      ) : (
                        renderAvatar(otherParticipant?.avatar, otherParticipant?.name, 'md', 'online')
                      )}
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {isGroup ? selectedConversation.group_name : (otherParticipant?.name || 'Unknown User')}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {isGroup ? (
                            <span>{selectedConversation.participants?.length || 0} members</span>
                          ) : (
                            <span className="capitalize">{otherParticipant?.role?.replace('_', ' ') || 'Online'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {!isGroup && (
                        <>
                          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800">
                            <Phone className="h-5 w-5" />
                          </button>
                          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800">
                            <Video className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {isGroup && (
                        <button
                          onClick={() => {
                            setGroupModalMode('manage')
                            setShowGroupModal(true)
                          }}
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
                          title="Manage Group"
                        >
                          <Settings className="h-5 w-5" />
                        </button>
                      )}
                      <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-400 dark:hover:bg-gray-800">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
              {messages.map((message, index) => {
                const isOwn = message.sender_id === user?.id
                const showAvatar = !isOwn && (index === 0 || messages[index - 1]?.sender_id !== message.sender_id)
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-end gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                      {!isOwn && showAvatar && (
                        <div className="flex-shrink-0 mb-1">
                          {renderAvatar(message.sender_avatar, message.sender_name, 'sm')}
                        </div>
                      )}
                      {!isOwn && !showAvatar && (
                        <div className="w-8 flex-shrink-0" />
                      )}
                      <div>
                        {!isOwn && showAvatar && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 px-2">
                            {message.sender_name}
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 ${
                            isOwn
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                              : 'bg-white border border-gray-200 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-white shadow-sm'
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
                          <div className={`text-[10px] mt-1 ${isOwn ? 'text-indigo-200' : 'text-gray-400 dark:text-gray-500'}`}>
                            {format(parseChatTimestamp(message.created_at), 'HH:mm')}
                          </div>
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
              <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between dark:bg-gray-900 dark:border-gray-700">
                <div className="flex items-center space-x-2">
                  <FileIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{fileInput.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">({formatFileSize(fileInput.size)})</span>
                </div>
                <button
                  onClick={() => {
                    setFileInput(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Message Input */}
            <form onSubmit={sendMessage} className="bg-white border-t border-gray-200 px-6 py-4 dark:bg-gray-900 dark:border-gray-700">
              <div className="flex items-end space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
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
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    rows={1}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(e)
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-2 bottom-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={sending || (!messageInput.trim() && !fileInput)}
                  className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Select a conversation</h3>
              <p className="text-gray-500 dark:text-gray-400">Choose a conversation from the sidebar or start a new one</p>
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
