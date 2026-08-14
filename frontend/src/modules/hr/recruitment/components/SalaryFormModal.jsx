import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { salaryAPI } from '../../../../api/salary'
import { Button, Modal } from '../../../../components/ui'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP']

const SalaryFormModal = ({ isOpen, onClose, employeeId, mode = 'assign', currentSalary = null, onSuccess }) => {
  const [components, setComponents] = useState([])
  const [form, setForm] = useState({
    effective_from: new Date().toISOString().split('T')[0],
    currency: 'INR',
    notes: '',
    items: [],
  })
  const [submitting, setSubmitting] = useState(false)

  // Load active components
  useEffect(() => {
    if (!isOpen) return
    salaryAPI.listComponents(false).then(res => setComponents(res.data || [])).catch(() => {})
  }, [isOpen])

  // Pre-fill from current salary when revising
  useEffect(() => {
    if (mode === 'revision' && currentSalary?.items) {
      setForm({
        effective_from: new Date().toISOString().split('T')[0],
        currency: currentSalary.currency || 'INR',
        notes: '',
        items: currentSalary.items.map(item => ({
          component_id: item.component_id,
          value: item.value || '',
          percentage: item.percentage || '',
          base_component_id: item.base_component_id || '',
        })),
      })
    } else {
      setForm({
        effective_from: new Date().toISOString().split('T')[0],
        currency: 'INR',
        notes: '',
        items: [],
      })
    }
  }, [mode, currentSalary, isOpen])

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { component_id: '', value: '', percentage: '', base_component_id: '' }],
    }))
  }

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const updateItem = (idx, field, val) => {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === idx ? { ...item, [field]: val } : item),
    }))
  }

  // Client-side preview calculation
  const preview = (() => {
    let earnings = 0, deductions = 0
    const resolved = form.items.map(item => {
      const comp = components.find(c => c.id === item.component_id)
      if (!comp) return { ...item, calc: 0, type: null }
      const val = Number(item.value) || 0
      let calc = val
      if (comp.calculation_type === 'percentage' && item.percentage) {
        // Find base component value
        const baseItem = form.items.find(fi => fi.component_id === (item.base_component_id || comp.base_component_id))
        const baseComp = baseItem ? components.find(c => c.id === baseItem.component_id) : null
        const baseVal = baseComp ? Number(baseItem.value) || 0 : 0
        calc = baseVal * Number(item.percentage) / 100
      }
      if (comp.component_type === 'earning') earnings += calc
      else deductions += calc
      return { ...item, calc, type: comp.component_type }
    })
    return { earnings, deductions, net: earnings - deductions, resolved }
  })()

  const handleSubmit = async () => {
    if (!form.effective_from) { toast.error('Effective date is required'); return }
    const validItems = form.items.filter(i => i.component_id)
    if (validItems.length === 0) { toast.error('Add at least one salary component'); return }

    try {
      setSubmitting(true)
      const payload = {
        effective_from: form.effective_from,
        currency: form.currency,
        notes: form.notes || null,
        items: validItems.map(i => ({
          component_id: i.component_id,
          value: Number(i.value) || 0,
          percentage: i.percentage ? Number(i.percentage) : null,
          base_component_id: i.base_component_id || null,
        })),
      }

      if (mode === 'revision') {
        await salaryAPI.reviseSalary(employeeId, payload)
        toast.success('Salary revision created')
      } else {
        await salaryAPI.assignSalary(employeeId, payload)
        toast.success('Salary structure assigned')
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save salary')
    } finally { setSubmitting(false) }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'revision' ? 'Revise Salary Structure' : 'Assign Salary Structure'}
    >
      <div className="space-y-4">
        {/* Effective Date + Currency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Effective From *</label>
            <input type="date" value={form.effective_from}
              onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Currency</label>
            <select value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Component Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Salary Components</label>
            <Button size="sm" variant="secondary" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>

          {form.items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-300 rounded-lg dark:border-gray-600">
              No components added. Click Add to begin.
            </p>
          ) : (
            <div className="space-y-3">
              {form.items.map((item, idx) => {
                const comp = components.find(c => c.id === item.component_id)
                const isPercentage = comp?.calculation_type === 'percentage'
                return (
                  <div key={idx} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <select value={item.component_id}
                            onChange={e => updateItem(idx, 'component_id', e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">Select component</option>
                            {components.filter(c => c.active).map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <input type="number" min="0" placeholder="Value"
                            value={item.value}
                            onChange={e => updateItem(idx, 'value', e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                          {isPercentage && (
                            <input type="number" min="0" max="100" placeholder="%"
                              value={item.percentage}
                              onChange={e => updateItem(idx, 'percentage', e.target.value)}
                              className="block w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeItem(idx)} className="mt-1 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {comp && (
                      <div className="mt-1 text-xs text-gray-400">
                        {comp.calculation_type === 'percentage'
                          ? `${comp.percentage_rate || item.percentage || 0}% of base`
                          : `Fixed: ${comp.component_type}`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Optional notes about this salary..." />
        </div>

        {/* Preview */}
        {form.items.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Preview</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Total Earnings</span>
                <span className="font-mono font-medium text-green-600">{preview.earnings.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Total Deductions</span>
                <span className="font-mono font-medium text-red-600">{preview.deductions.toLocaleString()}</span></div>
              <div className="border-t border-gray-200 pt-1 flex justify-between font-semibold dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">Configured Net</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{preview.net.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}><X className="h-4 w-4" /> Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} loadingText="Saving...">
            {mode === 'revision' ? 'Create Revision' : 'Assign Salary'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default SalaryFormModal
