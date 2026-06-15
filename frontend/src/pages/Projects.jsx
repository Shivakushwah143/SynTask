import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Trash2, GitBranch, Calendar, Package, Tag, X, Users, BarChart3, Columns3 } from 'lucide-react'
import { projectsApi } from '../api/projects'
import { componentsApi } from '../api/components'
import { versionsApi } from '../api/versions'
import { usersAPI } from '../api/users'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { EmptyState, SkeletonCard } from '../components/ui'

const Projects = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreateProjects = user?.role === 'company_admin' || user?.role === 'super_admin'
  const canEditProjects = user?.role === 'company_admin' || user?.role === 'super_admin'
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    type: 'software',
    lead_id: '',
    assigned_to: '',
    start_date: '',
    delivery_date: ''
  })
  const [assignableUsers, setAssignableUsers] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [showProjectDetails, setShowProjectDetails] = useState(false)
  const [components, setComponents] = useState([])
  const [versions, setVersions] = useState([])
  const [showComponentModal, setShowComponentModal] = useState(false)
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [componentForm, setComponentForm] = useState({ name: '', description: '' })
  const [versionForm, setVersionForm] = useState({ name: '', description: '', release_date: '' })
  const [projectDetails, setProjectDetails] = useState(null)
  const [projectTasks, setProjectTasks] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState({
    name: '',
    key: '',
    description: '',
    type: 'software',
    assigned_to: '',
    start_date: '',
    delivery_date: '',
  })

  useEffect(() => {
    loadProjects()
  }, [])

  // Check if we need to open a project from notification
  useEffect(() => {
    const projectId = sessionStorage.getItem('open_project_id')
    if (projectId && projects.length > 0) {
      sessionStorage.removeItem('open_project_id')
      // Wait a bit for projects to be fully loaded, then open the modal
      const timer = setTimeout(async () => {
        try {
          const project = projects.find(p => p.id === projectId)
          if (project) {
            setSelectedProject(project)
            setShowProjectDetails(true)
            await loadProjectDetails(project.id)
          }
        } catch (error) {
          console.error('Error loading project from notification:', error)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [projects])

  useEffect(() => {
    if (selectedProject) {
      loadComponents()
      loadVersions()
    }
  }, [selectedProject])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const response = await projectsApi.getProjects()
      const projects = response.data.projects || []
      // Remove duplicates by creating a map with unique IDs
      const uniqueProjectsMap = new Map()
      projects.forEach(project => {
        if (project && project.id && !uniqueProjectsMap.has(project.id)) {
          uniqueProjectsMap.set(project.id, project)
        }
      })
      setProjects(Array.from(uniqueProjectsMap.values()))
    } catch (error) {
      toast.error('Failed to load projects')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadAssignableUsers = async () => {
    try {
      const response = await usersAPI.getAssignableUsers()
      const users = response.users || []
      // Remove duplicates by creating a map with unique IDs
      const uniqueUsersMap = new Map()
      users.forEach(user => {
        if (user && user.id && !uniqueUsersMap.has(user.id)) {
          uniqueUsersMap.set(user.id, user)
        }
      })
      setAssignableUsers(Array.from(uniqueUsersMap.values()))
    } catch (error) {
      console.error('Error loading assignable users:', error)
    }
  }

  useEffect(() => {
    if (showCreateModal) {
      loadAssignableUsers()
    }
  }, [showCreateModal])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      // Convert datetime-local format to ISO string for backend
      const submitData = { ...formData }
      if (submitData.start_date) {
        submitData.start_date = new Date(submitData.start_date).toISOString()
      }
      if (submitData.delivery_date) {
        submitData.delivery_date = new Date(submitData.delivery_date).toISOString()
      }
      
      await projectsApi.createProject(submitData)
      toast.success('Project created successfully')
      setShowCreateModal(false)
      setFormData({ 
        name: '', 
        key: '', 
        description: '', 
        type: 'software', 
        lead_id: '',
        assigned_to: '',
        start_date: '',
        delivery_date: ''
      })
      loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return
    
    try {
      await projectsApi.deleteProject(id)
      toast.success('Project deleted successfully')
      loadProjects()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete project')
    }
  }

  const loadComponents = async () => {
    if (!selectedProject) return
    try {
      const response = await componentsApi.getComponents(selectedProject.id)
      setComponents(response.data.components || [])
    } catch (error) {
      console.error('Error loading components:', error)
    }
  }

  const loadVersions = async () => {
    if (!selectedProject) return
    try {
      const response = await versionsApi.getVersions(selectedProject.id)
      setVersions(response.data.versions || [])
    } catch (error) {
      console.error('Error loading versions:', error)
    }
  }

  const handleCreateComponent = async (e) => {
    e.preventDefault()
    if (!selectedProject) return
    try {
      await componentsApi.createComponent(selectedProject.id, componentForm)
      toast.success('Component created')
      setShowComponentModal(false)
      setComponentForm({ name: '', description: '' })
      loadComponents()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create component')
    }
  }

  const handleCreateVersion = async (e) => {
    e.preventDefault()
    if (!selectedProject) return
    try {
      await versionsApi.createVersion(selectedProject.id, versionForm)
      toast.success('Version created')
      setShowVersionModal(false)
      setVersionForm({ name: '', description: '', release_date: '' })
      loadVersions()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create version')
    }
  }

  const toDateTimeLocal = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 16)
  }

  const handleViewProject = async (project) => {
    setSelectedProject(project)
    // Prepare edit form with current project data
    setProjectEditForm({
      name: project.name || '',
      key: project.key || '',
      description: project.description || '',
      type: project.type || 'software',
      assigned_to: project.assigned_to || '',
      start_date: toDateTimeLocal(project.start_date),
      delivery_date: toDateTimeLocal(project.delivery_date),
    })
    setIsEditingProject(false)
    setShowProjectDetails(true)
    await Promise.all([
      loadProjectDetails(project.id),
      loadAssignableUsers(),
    ])
  }

  const handleUpdateProject = async () => {
    if (!selectedProject) return
    try {
      const submitData = { ...projectEditForm }
      // Convert datetime-local back to ISO for backend
      if (submitData.start_date) {
        submitData.start_date = new Date(submitData.start_date).toISOString()
      }
      if (submitData.delivery_date) {
        submitData.delivery_date = new Date(submitData.delivery_date).toISOString()
      }

      await projectsApi.updateProject(selectedProject.id, submitData)
      toast.success('Project updated successfully')
      setIsEditingProject(false)
      await loadProjects()
      await loadProjectDetails(selectedProject.id)
    } catch (error) {
      console.error('Error updating project:', error)
      toast.error(error.response?.data?.detail || 'Failed to update project')
    }
  }

  const loadProjectDetails = async (projectId) => {
    try {
      setLoadingDetails(true)
      const response = await projectsApi.getProject(projectId, { include_tasks: true })
      setProjectDetails(response.data)
      setProjectTasks(response.data.tasks || [])
    } catch (error) {
      toast.error('Failed to load project details')
      console.error(error)
    } finally {
      setLoadingDetails(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => <SkeletonCard key={item} lines={4} actions />)}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600 text-xs mt-0.5">Manage your projects and teams</p>
        </div>
        {canCreateProjects && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Project
          </button>
        )}
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description={canCreateProjects ? 'Get started by creating your first project.' : 'No projects have been assigned to you yet.'}
          action={canCreateProjects ? <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary">Create Project</button> : null}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleViewProject(project)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{project.name}</h3>
                  <p className="text-xs text-gray-500 font-mono">{project.key}</p>
                </div>
                {canCreateProjects && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(project.id)
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      title="Delete project"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              
              {project.description && (
                <p className="text-xs text-gray-600 mb-3 line-clamp-2">{project.description}</p>
              )}
              
              {/* Priority Badge */}
              {project.priority && (
                <div className="mb-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    project.priority === 'urgent' || project.priority === 'overdue' ? 'bg-red-100 text-red-700' :
                    project.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    project.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {project.priority === 'overdue' ? '⚠️ Overdue' :
                     project.priority === 'urgent' ? '🔴 Urgent' :
                     project.priority === 'high' ? '⚡ High Priority' :
                     project.priority === 'medium' ? '📅 Medium Priority' :
                     'Normal Priority'}
                  </span>
                </div>
              )}

              {/* Delivery Date */}
              {project.delivery_date && (
                <div className="mb-1.5 flex items-center text-xs text-gray-600">
                  <Calendar className="h-3 w-3 mr-1" />
                  <span className="truncate">Delivery: {format(new Date(project.delivery_date), 'MMM d, yyyy')}</span>
                  {project.days_until_delivery !== null && (
                    <span className="ml-1 text-[10px] whitespace-nowrap">
                      ({project.days_until_delivery < 0 ? `${Math.abs(project.days_until_delivery)}d overdue` :
                        project.days_until_delivery === 0 ? 'Due today' :
                        `${project.days_until_delivery}d left`})
                    </span>
                  )}
                </div>
              )}

              {/* Assigned To */}
              {project.assigned_to_name && (
                <div className="mb-1.5 flex items-center text-xs text-gray-600">
                  <Users className="h-3 w-3 mr-1" />
                  <span className="truncate">Assigned to: {project.assigned_to_name}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <GitBranch className="h-3 w-3 mr-1" />
                    <span>{project.task_count || 0} tasks</span>
                  </div>
                  <span className="capitalize">{project.type}</span>
                </div>
                <span className="capitalize px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                  {project.status}
                </span>
              </div>
              
              {/* View Board Button */}
              <div className="mt-3 pt-3 border-t">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/projects/${project.id}/board`)
                  }}
                  className="w-full flex items-center justify-center px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Columns3 className="h-3.5 w-3.5 mr-1.5" />
                  View Board
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Create New Project</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Key
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={10}
                      value={formData.key}
                      onChange={(e) => setFormData({ ...formData, key: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                      placeholder="e.g., WEB, DEV"
                    />
                    <p className="text-xs text-gray-500 mt-1">Unique key for this project</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="software">Software</option>
                      <option value="business">Business</option>
                      <option value="marketing">Marketing</option>
                      <option value="operations">Operations</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delivery Date *
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.delivery_date}
                      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Projects are ranked by delivery date (nearest first)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Assign To
                    </label>
                    <select
                      value={formData.assigned_to}
                      onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} ({u.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Assigned user will receive a notification</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create Project
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Details Modal */}
      {showProjectDetails && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-1">
                {isEditingProject ? (
                  <>
                    <input
                      type="text"
                      value={projectEditForm.name}
                      onChange={(e) =>
                        setProjectEditForm({ ...projectEditForm, name: e.target.value })
                      }
                      className="text-2xl font-bold border border-gray-300 rounded px-2 py-1 w-full"
                    />
                    <input
                      type="text"
                      value={projectEditForm.key}
                      onChange={(e) =>
                        setProjectEditForm({ ...projectEditForm, key: e.target.value.toUpperCase() })
                      }
                      className="text-gray-500 font-mono border border-gray-300 rounded px-2 py-1 w-full max-w-xs"
                    />
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold">{selectedProject.name}</h2>
                    <p className="text-gray-500 font-mono">{selectedProject.key}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEditingProject && canEditProjects && (
                  <button
                    onClick={() => setIsEditingProject(true)}
                    className="px-3 py-1 text-sm bg-primary-50 text-primary-700 rounded border border-primary-200 hover:bg-primary-100"
                  >
                    Edit Project
                  </button>
                )}
                {isEditingProject && (
                  <>
                    <button
                      onClick={handleUpdateProject}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => {
                        // Reset form back to selected project values
                        if (selectedProject) {
                          setProjectEditForm({
                            name: selectedProject.name || '',
                            key: selectedProject.key || '',
                            description: selectedProject.description || '',
                            type: selectedProject.type || 'software',
                            assigned_to: selectedProject.assigned_to || '',
                            start_date: toDateTimeLocal(selectedProject.start_date),
                            delivery_date: toDateTimeLocal(selectedProject.delivery_date),
                          })
                        }
                        setIsEditingProject(false)
                      }}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setShowProjectDetails(false)
                    setSelectedProject(null)
                    setProjectDetails(null)
                    setProjectTasks([])
                    setIsEditingProject(false)
                  }}
                  className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Project basic info + assignment */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                {isEditingProject ? (
                  <textarea
                    value={projectEditForm.description}
                    onChange={(e) =>
                      setProjectEditForm({ ...projectEditForm, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                ) : (
                  <p className="text-sm text-gray-700">
                    {selectedProject.description || 'No description'}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To
                  </label>
                  {isEditingProject ? (
                    <select
                      value={projectEditForm.assigned_to}
                      onChange={(e) =>
                        setProjectEditForm({ ...projectEditForm, assigned_to: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} ({u.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-700">
                      {projectDetails?.assigned_to_name ||
                        selectedProject.assigned_to_name ||
                        'Unassigned'}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    {isEditingProject ? (
                      <input
                        type="datetime-local"
                        value={projectEditForm.start_date}
                        onChange={(e) =>
                          setProjectEditForm({ ...projectEditForm, start_date: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    ) : selectedProject.start_date ? (
                      <p className="text-sm text-gray-700">
                        {format(new Date(selectedProject.start_date), 'MMM d, yyyy h:mm a')}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">Not set</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delivery Date
                    </label>
                    {isEditingProject ? (
                      <input
                        type="datetime-local"
                        value={projectEditForm.delivery_date}
                        onChange={(e) =>
                          setProjectEditForm({ ...projectEditForm, delivery_date: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    ) : selectedProject.delivery_date ? (
                      <p className="text-sm text-gray-700">
                        {format(new Date(selectedProject.delivery_date), 'MMM d, yyyy h:mm a')}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">Not set</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {loadingDetails ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
              </div>
            ) : projectDetails ? (
              <>
                {/* Statistics Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2" />
                    Project Statistics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Total Tasks</div>
                      <div className="text-2xl font-bold text-blue-600">{projectDetails.task_count || 0}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Completed</div>
                      <div className="text-2xl font-bold text-green-600">
                        {projectDetails.statistics?.completed_count || 0}
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">In Progress</div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {projectDetails.statistics?.in_progress_count || 0}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600">Completion</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {projectDetails.statistics?.completion_percentage || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-lg font-semibold">{projectDetails.statistics?.tasks_by_status?.todo || 0}</div>
                      <div className="text-xs text-gray-600">To Do</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-semibold text-blue-600">
                        {projectDetails.statistics?.tasks_by_status?.in_progress || 0}
                      </div>
                      <div className="text-xs text-gray-600">In Progress</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <div className="text-lg font-semibold text-yellow-600">
                        {projectDetails.statistics?.tasks_by_status?.in_review || 0}
                      </div>
                      <div className="text-xs text-gray-600">In Review</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-lg font-semibold text-green-600">
                        {projectDetails.statistics?.tasks_by_status?.completed || 0}
                      </div>
                      <div className="text-xs text-gray-600">Completed</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-lg font-semibold">{projectDetails.statistics?.tasks_by_status?.on_hold || 0}</div>
                      <div className="text-xs text-gray-600">On Hold</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-lg font-semibold text-red-600">
                        {projectDetails.statistics?.tasks_by_status?.cancelled || 0}
                      </div>
                      <div className="text-xs text-gray-600">Cancelled</div>
                    </div>
                  </div>
                </div>

                {/* Tasks by Assignee */}
                {projectDetails.assigned_tasks_by_user && projectDetails.assigned_tasks_by_user.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <Users className="h-5 w-5 mr-2" />
                      Tasks by Assignee
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {projectDetails.assigned_tasks_by_user
                        .filter((userData, index, self) => 
                          index === self.findIndex(u => u.user_id === userData.user_id)
                        )
                        .map((userData, index) => (
                        <div key={`user-task-${userData.user_id || index}`} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-semibold">{userData.user_name || 'Unknown'}</div>
                              <div className="text-xs text-gray-500">{userData.user_email}</div>
                              <div className="text-xs text-gray-500 capitalize">{userData.user_role}</div>
                            </div>
                            <div className="text-2xl font-bold text-primary-600">{userData.task_count}</div>
                          </div>
                          <div className="text-sm text-gray-600">tasks assigned</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Tasks List */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">All Tasks ({projectTasks.length})</h3>
                  {projectTasks.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <p className="text-gray-500">No tasks in this project yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Task</th>
                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Status</th>
                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Priority</th>
                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Assigned To</th>
                            <th className="text-left p-3 text-sm font-semibold text-gray-700">Due Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectTasks
                            .filter((task, index, self) => 
                              index === self.findIndex(t => t.id === task.id)
                            )
                            .map((task, index) => (
                            <tr key={`task-${task.id || index}`} className="border-b hover:bg-gray-50">
                              <td className="p-3">
                                <div className="font-medium text-sm">{task.title}</div>
                                {task.description && (
                                  <div className="text-xs text-gray-500 mt-1 line-clamp-1">{task.description}</div>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded text-xs capitalize ${
                                  task.status === 'completed' ? 'bg-green-100 text-green-700' :
                                  task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                  task.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
                                  task.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  task.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                  task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                  task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {task.priority}
                                </span>
                              </td>
                              <td className="p-3">
                                {task.assigned_to_name ? (
                                  <div className="flex items-center text-sm">
                                    <Users className="h-4 w-4 mr-1 text-gray-400" />
                                    {task.assigned_to_name}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">Unassigned</span>
                                )}
                              </td>
                              <td className="p-3">
                                {task.due_date ? (
                                  <div className="flex items-center text-sm text-gray-600">
                                    <Calendar className="h-4 w-4 mr-1" />
                                    {new Date(task.due_date).toLocaleDateString()}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">No due date</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Components and Versions Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {/* Components */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center">
                        <Package className="h-5 w-5 mr-2" />
                        Components
                      </h3>
                      <button
                        onClick={() => setShowComponentModal(true)}
                        className="text-primary-600 hover:text-primary-700 text-sm flex items-center"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                  {components.length === 0 ? (
                    <p className="text-gray-500 text-sm">No components yet</p>
                  ) : (
                    components.map((c) => (
                      <div key={c.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="font-medium text-sm">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-gray-500 mt-1">{c.description}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

                  {/* Versions */}
                  <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center">
                    <Tag className="h-5 w-5 mr-2" />
                    Versions
                  </h3>
                  <button
                    onClick={() => setShowVersionModal(true)}
                    className="text-primary-600 hover:text-primary-700 text-sm flex items-center"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </button>
                </div>
                <div className="space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-gray-500 text-sm">No versions yet</p>
                  ) : (
                    versions.map((v) => (
                      <div key={v.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{v.name}</div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            v.released ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {v.released ? 'Released' : 'Unreleased'}
                          </span>
                        </div>
                        {v.description && (
                          <div className="text-xs text-gray-500 mt-1">{v.description}</div>
                        )}
                        {v.release_date && (
                          <div className="text-xs text-gray-500 mt-1">
                            Release: {new Date(v.release_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowProjectDetails(false)
                  setSelectedProject(null)
                  setProjectDetails(null)
                  setProjectTasks([])
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Component Modal */}
      {showComponentModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Create Component</h3>
            <form onSubmit={handleCreateComponent}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={componentForm.name}
                    onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={componentForm.description}
                    onChange={(e) => setComponentForm({ ...componentForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowComponentModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version Modal */}
      {showVersionModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Create Version</h3>
            <form onSubmit={handleCreateVersion}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    value={versionForm.name}
                    onChange={(e) => setVersionForm({ ...versionForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., 1.0.0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={versionForm.description}
                    onChange={(e) => setVersionForm({ ...versionForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Release Date
                  </label>
                  <input
                    type="date"
                    value={versionForm.release_date}
                    onChange={(e) => setVersionForm({ ...versionForm, release_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowVersionModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
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

export default Projects

