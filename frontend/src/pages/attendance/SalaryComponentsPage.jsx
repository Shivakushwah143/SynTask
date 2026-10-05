import { useCallback, useEffect, useState } from 'react'
import { DollarSign, Plus, Pencil, Trash2, AlertCircle, RefreshCw, X, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { salaryAPI } from '../../api/salary'
import { Button, Modal, PageHeader, Skeleton } from '../../components/ui'

const COMPONENT_TYPES = [
  { value: 'earning', label: 'Earning' },
  { value: 'deduction', label: 'Deduction' },
]

const CALCULATION_TYPES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'percentage', label: 'Percentage' },
]

const SalaryComponentsPage = () => {
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', code: '', component_type: 'earning', calculation_type: 'fixed',
    percentage_rate: '', base_component_id: '', default_value: '', taxable: false,
  })
  const [submitting, setSubmitting] = useState(false)

  const loadComponents = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const res = await salaryAPI.listComponents(true)
      setComponents(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load salary components')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadComponents() }, [loadComponents])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', component_type: 'earning', calculation_type: 'fixed', percentage_rate: '', base_component_id: '', default_value: '', taxable: false })
    setShowForm(true)
  }

  const openEdit = (comp) => {
    setEditing(comp)
    setForm({
      name: comp.name, code: comp.code, component_type: comp.component_type,
      calculation_type: comp.calculation_type, percentage_rate: comp.percentage_rate || '',
      base_component_id: comp.base_component_id || '', default_value: comp.default_value || '',
      taxable: comp.taxable,
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    try {
      setSubmitting(true)
      const payload = {
        name: form.name.trim(), code: form.code.trim() || form.name.trim().toLowerCase().replace(/\s+/g, '_'),
        component_type: form.component_type, calculation_type: form.calculation_type,
        default_value: form.default_value ? Number(form.default_value) : 0,
        taxable: form.taxable,
      }
      if (form.calculation_type === 'percentage') {
        payload.percentage_rate = form.percentage_rate ? Number(form.percentage_rate) : null
        payload.base_component_id = form.base_component_id || null
      }
      if (editing) {
        await salaryAPI.updateComponent(editing.id, payload)
        toast.success('Component updated')
      } else {
        await salaryAPI.createComponent(payload)
        toast.success('Component created')
      }
      setShowForm(false); loadComponents()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save component')
    } finally { setSubmitting(false) }
  }

  const handleToggleActive = async (comp) => {
    try {
      await salaryAPI.updateComponent(comp.id, { active: !comp.active })
      toast.success(comp.active ? 'Component deactivated' : 'Component activated')
      loadComponents()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to toggle')
    }
  }

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(val || 0)

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Salary Components" description="Configure company salary components." />
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Salary Components" />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load components</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadComponents}><RefreshCw className="h-4 w-4" /> Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Salary Components" description="Configure earning and deduction components for salary structures."
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Component</Button>} />

      {components.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <DollarSign className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No salary components configured</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create components to build salary structures.</p>
          <Button className="mt-4" onClick={openCreate}><Plus className="h-4 w-4" /> Add First Component</Button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Calc</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {components.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400">{c.code}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        c.component_type === 'earning' ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                      }`}>{c.component_type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {c.calculation_type === 'percentage' ? `${c.percentage_rate}%` : 'Fixed'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(c)} className="flex items-center gap-1">
                        {c.active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                        <span className={`text-xs font-medium ${c.active ? 'text-green-600' : 'text-gray-400'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(c)} className="mr-2 text-gray-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Component' : 'Add Component'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Code (auto-generated if empty)</label>
            <input type="text" value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))}
              placeholder="e.g. basic_salary"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Type *</label>
              <select value={form.component_type} onChange={e => setForm(f => ({...f, component_type: e.target.value}))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                {COMPONENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Calculation *</label>
              <select value={form.calculation_type} onChange={e => setForm(f => ({...f, calculation_type: e.target.value}))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                {CALCULATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {form.calculation_type === 'percentage' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Percentage Rate</label>
                <input type="number" min="0" max="100" step="0.1" value={form.percentage_rate}
                  onChange={e => setForm(f => ({...f, percentage_rate: e.target.value}))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Base Component</label>
                <select value={form.base_component_id} onChange={e => setForm(f => ({...f, base_component_id: e.target.value}))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                  <option value="">None</option>
                  {components.filter(c => c.active && c.component_type === 'earning').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.taxable} onChange={e => setForm(f => ({...f, taxable: e.target.checked}))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
            <label className="text-sm text-gray-700 dark:text-gray-300">Taxable</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}><X className="h-4 w-4" /> Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting} loadingText="Saving...">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default SalaryComponentsPage
