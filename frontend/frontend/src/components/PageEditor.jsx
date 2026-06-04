import { useState, useEffect } from 'react'
import { Save, X } from 'lucide-react'
import { projectsApi } from '../api/projects'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const PageEditor = ({ projectId, page, onClose, onSave }) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('draft')
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)

  useEffect(() => {
    if (page) {
      setTitle(page.title || '')
      setContent(page.content || '')
      setStatus(page.status || 'draft')
    } else {
      setTitle('')
      setContent('')
      setStatus('draft')
    }
  }, [page])

  // Auto-save functionality
  useEffect(() => {
    if (!page || title.trim() === '' && content.trim() === '') return
    
    const autoSaveTimer = setTimeout(async () => {
      if (page && title.trim() && (title !== page.title || content !== page.content)) {
        setAutoSaving(true)
        try {
          await projectsApi.updatePage(projectId, page.id, {
            title: title.trim(),
            content: content,
          })
          setAutoSaving(false)
        } catch (error) {
          console.error('Auto-save failed:', error)
          setAutoSaving(false)
        }
      }
    }, 2000) // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSaveTimer)
  }, [title, content, page, projectId])

  const handleSave = async (publish = false) => {
    if (!title.trim()) {
      toast.error('Page title is required')
      return
    }

    try {
      setSaving(true)
      const pageStatus = publish ? 'published' : status

      if (page) {
        // Update existing page
        await projectsApi.updatePage(projectId, page.id, {
          title: title.trim(),
          content: content,
          status: pageStatus,
        })
        toast.success('Page updated successfully')
      } else {
        // Create new page
        await projectsApi.createPage(projectId, {
          title: title.trim(),
          content: content,
          status: pageStatus,
          template: 'blank',
        })
        toast.success('Page created successfully')
      }
      
      onSave()
      if (publish) {
        onClose()
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save page')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor Toolbar */}
      <div className="border-b border-gray-200 p-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {autoSaving && (
            <span className="text-xs text-gray-500">Saving...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Page title..."
          className="w-full text-3xl font-bold border-none outline-none mb-4 placeholder-gray-400"
        />
        
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start from scratch with a blank page. Pages are the place to capture all your important information. Start with a blank page and add rich content such as tasks, images, and more. @mention to tag your teammates and collaborate."
          className="w-full min-h-[400px] border-none outline-none resize-none placeholder-gray-400 text-gray-700 leading-relaxed"
          style={{ fontFamily: 'inherit' }}
        />
      </div>

      {/* Editor Footer */}
      <div className="border-t border-gray-200 p-4 flex items-center justify-between text-sm text-gray-500">
        <div>
          {page && (
            <span>
              Last updated {format(new Date(page.updated_at || page.created_at), 'MMM d, yyyy h:mm a')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs">Press Ctrl+S to save</span>
        </div>
      </div>
    </div>
  )
}

export default PageEditor


