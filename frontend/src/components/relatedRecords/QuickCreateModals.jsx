import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, FormField, Modal, PasswordInput, PhoneInput, inputClassName } from '../ui'
import { usersAPI } from '../../api/users'
import { departmentsAPI } from '../../api/departments'
import { projectsApi } from '../../api/projects'
import { clientsAPI } from '../../api/clients'
import { getDesignationOptions } from '../../constants/designations'

const tempPassword = () => `SynTask@${Math.random().toString(36).slice(2, 8)}1`

const getRecordId = (record) => record?.id || record?._id || record?.user_id || record?.project_id || record?.client_id

export function QuickCreateEmployeeModal({
  isOpen,
  onClose,
  onCreated,
  existing = [],
  departments = [],
  leads = [],
  departmentId = '',
  leadId = '',
  canCreateLead = false,
  defaultRole = 'employee',
}) {
  const initialRole = canCreateLead && defaultRole === 'lead' ? 'lead' : 'employee'
  const [form, setForm] = useState({
    role: initialRole,
    first_name: '',
    last_name: '',
    email: '',
    password: tempPassword(),
    designation: '',
    phone: '',
    department_id: departmentId,
    lead_id: leadId,
    team_name: '',
  })
  const [saving, setSaving] = useState(false)
  const [customDesignations, setCustomDesignations] = useState([])
  const [designationSearch, setDesignationSearch] = useState('')
  const [showDesignationCreate, setShowDesignationCreate] = useState(false)
  const [newDesignationName, setNewDesignationName] = useState('')
  const [designationError, setDesignationError] = useState('')
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const designationOptions = useMemo(() => getDesignationOptions(customDesignations, form.designation), [customDesignations, form.designation])
  const visibleDesignations = useMemo(() => {
    const query = designationSearch.trim().toLowerCase()
    if (!query) return designationOptions
    return designationOptions.filter((item) => item.toLowerCase().includes(query))
  }, [designationOptions, designationSearch])

  const handleCreateDesignation = () => {
    const name = newDesignationName.trim()
    if (!name) {
      setDesignationError('Designation is required')
      return
    }
    if (designationOptions.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setDesignationError('Designation already exists')
      return
    }
    setCustomDesignations((current) => [...current, name])
    update('designation', name)
    setDesignationSearch('')
    setNewDesignationName('')
    setDesignationError('')
    setShowDesignationCreate(false)
  }

  useEffect(() => {
    if (!isOpen) return
    setForm((state) => ({
      ...state,
      role: initialRole,
      department_id: departmentId,
      lead_id: leadId,
    }))
  }, [departmentId, initialRole, isOpen, leadId])

  const submit = async (event) => {
    event.preventDefault()
    const email = form.email.trim().toLowerCase()
    if (existing.some((item) => String(item.email || '').toLowerCase() === email)) {
      toast.error('User already exists')
      return
    }
    const role = canCreateLead && form.role === 'lead' ? 'lead' : 'employee'
    const payload = {
      email,
      password: form.password,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      department_id: form.department_id || departmentId,
    }
    if (role === 'lead') {
      payload.team_name = form.team_name.trim()
    } else {
      payload.lead_id = form.lead_id || leadId
      payload.designation = form.designation.trim()
    }
    try {
      setSaving(true)
      const result = role === 'lead' ? await usersAPI.createLead(payload) : await usersAPI.createEmployee(payload)
      await onCreated?.({ id: result.user_id, email, ...payload, role })
      setForm({
        role: initialRole,
        first_name: '',
        last_name: '',
        email: '',
        password: tempPassword(),
        designation: '',
        phone: '',
        department_id: departmentId,
        lead_id: leadId,
        team_name: '',
      })
      onClose()
      toast.success(role === 'lead' ? 'Lead created' : 'Employee created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create user" size="lg" zIndexClass="z-[70]">
      <form onSubmit={submit} className="space-y-4">
        {canCreateLead && (
          <FormField label="Role" required>
            <select required className={inputClassName} value={form.role} onChange={(event) => update('role', event.target.value)}>
              <option value="employee">Employee</option>
              <option value="lead">Lead</option>
            </select>
          </FormField>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="First name" required><input required className={inputClassName} value={form.first_name} onChange={(event) => update('first_name', event.target.value)} /></FormField>
          <FormField label="Last name" required><input required className={inputClassName} value={form.last_name} onChange={(event) => update('last_name', event.target.value)} /></FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Email" required><input required type="email" className={inputClassName} value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
          <FormField label="Temporary password" required><PasswordInput required className={inputClassName} value={form.password} onChange={(event) => update('password', event.target.value)} toggleLabel="temporary password" /></FormField>
        </div>
        {departments.length > 0 && (
          <FormField label="Department">
            <select className={inputClassName} value={form.department_id} onChange={(event) => update('department_id', event.target.value)}>
              <option value="">No department</option>
              {departments.map((department) => <option key={getRecordId(department)} value={getRecordId(department)}>{department.name}</option>)}
            </select>
          </FormField>
        )}
        {form.role === 'lead' ? (
          <FormField label="Team name"><input className={inputClassName} value={form.team_name} onChange={(event) => update('team_name', event.target.value)} /></FormField>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {leads.length > 0 && (
              <FormField label="Lead">
                <select className={inputClassName} value={form.lead_id} onChange={(event) => update('lead_id', event.target.value)}>
                  <option value="">No lead</option>
                  {leads.map((lead) => <option key={getRecordId(lead)} value={getRecordId(lead)}>{lead.first_name} {lead.last_name}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="Designation">
              <div className="space-y-2">
                <input
                  className={inputClassName}
                  value={designationSearch}
                  onChange={(event) => setDesignationSearch(event.target.value)}
                  placeholder="Search designation..."
                  aria-label="Search designation"
                />
                <select
                  className={inputClassName}
                  value={form.designation}
                  onChange={(event) => {
                    if (event.target.value === '__create_designation__') {
                      setShowDesignationCreate(true)
                      setDesignationError('')
                      return
                    }
                    update('designation', event.target.value)
                    setShowDesignationCreate(false)
                    setDesignationError('')
                  }}
                >
                  <option value="">Select designation</option>
                  {visibleDesignations.map((designation) => (
                    <option key={designation} value={designation}>{designation}</option>
                  ))}
                  <option value="__create_designation__">+ Add designation</option>
                </select>
                {showDesignationCreate && (
                  <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-3 dark:border-indigo-500/25 dark:bg-indigo-500/10">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={newDesignationName}
                        onChange={(event) => {
                          setNewDesignationName(event.target.value)
                          if (designationError) setDesignationError('')
                        }}
                        className={`${inputClassName} flex-1 ${designationError ? 'border-red-500' : ''}`}
                        placeholder="Enter designation"
                      />
                      <Button type="button" onClick={handleCreateDesignation} className="min-h-11 gap-1.5">
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    {designationError && <p className="mt-1 text-xs text-red-500">{designationError}</p>}
                  </div>
                )}
              </div>
            </FormField>
          </div>
        )}
        <FormField label="Phone"><PhoneInput className={inputClassName} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} loadingText="Creating">Create</Button>
        </div>
      </form>
    </Modal>
  )
}

export function QuickCreateDepartmentModal({ isOpen, onClose, onCreated, existing = [] }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (existing.some((item) => String(item.name || '').toLowerCase() === cleanName.toLowerCase())) {
      toast.error('Department already exists')
      return
    }
    try {
      setSaving(true)
      const result = await departmentsAPI.createDepartment({ name: cleanName })
      await onCreated?.(result.department || result)
      setName('')
      onClose()
      toast.success('Department created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create department')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create department" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Department name" required><input required className={inputClassName} value={name} onChange={(event) => setName(event.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} loadingText="Creating">Create</Button>
        </div>
      </form>
    </Modal>
  )
}

export function QuickCreateProjectModal({ isOpen, onClose, onCreated, existing = [], assignedTo = '', clientId = '' }) {
  const [form, setForm] = useState({ name: '', key: '', project_id: '', description: '', type: 'software' })
  const [saving, setSaving] = useState(false)
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    const key = form.key.trim().toUpperCase()
    const projectId = form.project_id.trim() || key
    if (existing.some((item) => [item.name, item.key, item.project_id].some((value) => String(value || '').toLowerCase() === String(form.name || key || projectId).toLowerCase()))) {
      toast.error('Project already exists')
      return
    }
    try {
      setSaving(true)
      const response = await projectsApi.createProject({ ...form, key, project_id: projectId, assigned_to: assignedTo, client_id: clientId })
      const created = response.data?.project || response.data || {}
      await onCreated?.({ ...created, id: getRecordId(created) || projectId, name: form.name, key, project_id: projectId })
      setForm({ name: '', key: '', project_id: '', description: '', type: 'software' })
      onClose()
      toast.success('Project created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create project" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Project name" required><input required className={inputClassName} value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField>
          <FormField label="Project key" required><input required className={`${inputClassName} font-mono`} value={form.key} onChange={(event) => update('key', event.target.value.toUpperCase())} /></FormField>
        </div>
        <FormField label="Project ID"><input className={`${inputClassName} font-mono`} value={form.project_id} onChange={(event) => update('project_id', event.target.value)} placeholder="Defaults to project key" /></FormField>
        <FormField label="Type"><select className={inputClassName} value={form.type} onChange={(event) => update('type', event.target.value)}><option value="software">Software</option><option value="business">Business</option><option value="marketing">Marketing</option><option value="operations">Operations</option><option value="other">Other</option></select></FormField>
        <FormField label="Description"><textarea className={inputClassName} rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} loadingText="Creating">Create</Button>
        </div>
      </form>
    </Modal>
  )
}

export function QuickCreateClientModal({ isOpen, onClose, onCreated, existing = [], assignedTo = '' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company_name: '' })
  const [saving, setSaving] = useState(false)
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    const cleanName = form.name.trim()
    if (existing.some((item) => String(item.name || '').toLowerCase() === cleanName.toLowerCase())) {
      toast.error('Client already exists')
      return
    }
    try {
      setSaving(true)
      const payload = new FormData()
      Object.entries({ ...form, assigned_to: assignedTo }).forEach(([key, value]) => {
        if (value) payload.append(key, value)
      })
      const result = await clientsAPI.createClient(payload)
      const created = result.client || result
      await onCreated?.({ ...created, id: getRecordId(created), name: cleanName })
      setForm({ name: '', email: '', phone: '', company_name: '' })
      onClose()
      toast.success('Client created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create client" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Client name" required><input required className={inputClassName} value={form.name} onChange={(event) => update('name', event.target.value)} /></FormField>
        <FormField label="Email"><input type="email" className={inputClassName} value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
        <FormField label="Phone"><PhoneInput className={inputClassName} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></FormField>
        <FormField label="Company"><input className={inputClassName} value={form.company_name} onChange={(event) => update('company_name', event.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} loadingText="Creating">Create</Button>
        </div>
      </form>
    </Modal>
  )
}
