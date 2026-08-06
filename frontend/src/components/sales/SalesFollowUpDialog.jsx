/**
 * SalesFollowUpDialog — Reusable modal for scheduling, rescheduling, and
 * cancelling lead follow-ups.  Opened from the pipeline board/row, the lead
 * workspace, or the Sales overview.  Works with the Sales follow-up API
 * (backend/app/api/v1/endpoints/sales_followups.py).
 *
 * Props
 * -----
 * open          – boolean, controls visibility
 * lead          – { id, company_name, prospect_name, assigned_to, current_stage, … }
 *               – when null the dialog shows a searchable lead selector
 * users         – assignable users list (for assignee dropdown)
 * mode          – "create" (default) | "reschedule"
 * followUpData  – existing follow-up object (required when mode="reschedule")
 * onClose       – called when the user closes the dialog
 * onCreated     – called with the created/updated follow-up after success
 * onRescheduled – called after a successful reschedule
 * onCancelled   – called after a successful cancel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarClock, Check, Loader2, X } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { invalidateWorkspaceCalendar } from '../../api/calendar'
import { timeService } from '../../services/timeService'
import { Button, LoadingSpinner } from '../ui'

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const QUICK_DATE_OPTIONS = [
  { label: 'Tomorrow', offsetDays: 1 },
  { label: 'In 2 days', offsetDays: 2 },
  { label: 'In 4 days', offsetDays: 4 },
  { label: 'In 1 week', offsetDays: 7 },
]

/** Return a Date offset from `base` by `days` days, keeping the current time. */
function addDays(base, days) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

/** Format a Date to a datetime-local input value (YYYY-MM-DDTHH:MM). */
function toDatetimeLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

/** Build the default title from the lead. */
function defaultTitle(lead) {
  const name = lead?.company_name || lead?.prospect_name || 'this lead'
  return `Follow up with ${name}`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function DialogHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

function FormField({ label, required = false, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SalesFollowUpDialog({
  open,
  lead: initialLead,
  users = [],
  mode = 'create',
  followUpData = null,
  onClose,
  onCreated,
  onRescheduled,
  onCancelled,
}) {
  const queryClient = useQueryClient()

  // ── Lead search (shown when opened from Sales Overview without a preselected lead) ──
  const [leadSearch, setLeadSearch] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(initialLead?.id || '')
  const [leadsList, setLeadsList] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(false)

  // Fetch leads when the dialog opens without a lead and the user types
  useEffect(() => {
    if (!open) {
      setLeadSearch('')
      setSelectedLeadId('')
      setLeadsList([])
      return
    }
    setSelectedLeadId(initialLead?.id || '')
  }, [open, initialLead])

  const fetchLeads = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setLeadsList([])
      return
    }
    setLeadsLoading(true)
    try {
      const response = await salesApi.getProspects({ q: query, limit: 10 })
      const data = response?.data || response
      const items = data?.prospects || data?.leads || data?.data || (Array.isArray(data) ? data : [])
      setLeadsList(Array.isArray(items) ? items.slice(0, 10) : [])
    } catch {
      setLeadsList([])
    } finally {
      setLeadsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => fetchLeads(leadSearch), 300)
    return () => clearTimeout(timer)
  }, [leadSearch])

  // ── Form state ─────────────────────────────────────────────────────────
  const now = useMemo(() => timeService.nowLocal ? timeService.nowLocal() : new Date(), [])
  const defaultDatetime = useMemo(() => {
    const d = addDays(now, 4)
    // Round to next 30-minute slot
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30)
    return d
  }, [now])

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [priority, setPriority] = useState('medium')
  const [estimatedHours, setEstimatedHours] = useState(0.5)
  const [scheduledAt, setScheduledAt] = useState('')
  const [leadId, setLeadId] = useState('')
  const [currentLead, setCurrentLead] = useState(null)
  const [errors, setErrors] = useState({})
  const titleRef = useRef(null)

  // Pre-populate form when a lead is provided
  useEffect(() => {
    if (!open) return
    const lead = initialLead
    setCurrentLead(lead)
    setLeadId(lead?.id || '')
    setAssignedTo(lead?.assigned_to || '')
    if (mode === 'reschedule' && followUpData) {
      setTitle(followUpData.title || defaultTitle(lead))
      setNotes(followUpData.notes || '')
      setPriority(followUpData.priority || 'medium')
      setEstimatedHours(followUpData.estimated_hours ?? 0.5)
      // Convert the existing UTC scheduled_at to local datetime-local
      if (followUpData.scheduled_at) {
        const utcDate = new Date(followUpData.scheduled_at)
        setScheduledAt(toDatetimeLocal(utcDate))
      } else {
        setScheduledAt(toDatetimeLocal(defaultDatetime))
      }
    } else {
      setTitle(defaultTitle(lead))
      setNotes('')
      setPriority('medium')
      setEstimatedHours(0.5)
      setScheduledAt(toDatetimeLocal(defaultDatetime))
    }
    setErrors({})
  }, [open, initialLead, mode, followUpData, defaultDatetime])

  // When a lead is selected from search
  useEffect(() => {
    if (!selectedLeadId || initialLead) return
    const found = leadsList.find((l) => l.id === selectedLeadId || l._id === selectedLeadId)
    if (found) {
      setCurrentLead(found)
      setLeadId(found.id || found._id)
      setAssignedTo(found.assigned_to || '')
      setTitle(defaultTitle(found))
    }
  }, [selectedLeadId, leadsList, initialLead])

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100)
    }
  }, [open])

  // ── Validation ─────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const newErrors = {}

    if (!leadId) {
      newErrors.lead = 'Please select a lead'
    }

    if (!scheduledAt) {
      newErrors.scheduledAt = 'Follow-up date and time is required'
    } else {
      // Parse the local datetime input as local time
      const dt = new Date(scheduledAt)
      if (Number.isNaN(dt.getTime())) {
        newErrors.scheduledAt = 'Invalid date/time'
      } else if (dt <= new Date()) {
        newErrors.scheduledAt = 'Follow-up time must be in the future'
      }
    }

    if (!title.trim()) {
      newErrors.title = 'Title is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [leadId, scheduledAt, title])

  // ── Submit ─────────────────────────────────────────────────────────────
  const createMutation = useMutation(
    (payload) => salesApi.createLeadFollowUp(leadId, payload),
    {
      onSuccess: (response) => {
        const data = response?.data || response
        toast.success('Follow-up scheduled! 📅')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
        queryClient.invalidateQueries('crm-all-leads')
        if (leadId) {
          queryClient.invalidateQueries(['crm-lead-workspace', leadId])
        }
        invalidateWorkspaceCalendar(queryClient)
        onCreated?.(data)
        onClose?.()
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail
        if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Failed to schedule follow-up')
        }
      },
    },
  )

  const rescheduleMutation = useMutation(
    (payload) => salesApi.updateLeadFollowUp(leadId, followUpData?.id, payload),
    {
      onSuccess: (response) => {
        const data = response?.data || response
        toast.success('Follow-up rescheduled! 📅')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
        if (leadId) {
          queryClient.invalidateQueries(['crm-lead-workspace', leadId])
        }
        invalidateWorkspaceCalendar(queryClient)
        onRescheduled?.(data)
        onClose?.()
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail
        if (typeof detail === 'string') {
          toast.error(detail)
        } else {
          toast.error('Failed to reschedule follow-up')
        }
      },
    },
  )

  const cancelMutation = useMutation(
    () => salesApi.cancelLeadFollowUp(leadId, followUpData?.id),
    {
      onSuccess: (response) => {
        const data = response?.data || response
        toast.success('Follow-up cancelled')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
        if (leadId) {
          queryClient.invalidateQueries(['crm-lead-workspace', leadId])
        }
        invalidateWorkspaceCalendar(queryClient)
        onCancelled?.(data)
        onClose?.()
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail
        toast.error(typeof detail === 'string' ? detail : 'Failed to cancel follow-up')
      },
    },
  )

  const isSubmitting = createMutation.isLoading || rescheduleMutation.isLoading || cancelMutation.isLoading

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault()
      if (!validate() || isSubmitting) return

      // Convert local datetime input to UTC ISO string for the backend
      const localDate = new Date(scheduledAt)
      const utcIso = localDate.toISOString()

      const payload = {
        scheduled_at: utcIso,
        title: title.trim(),
        notes: notes.trim() || undefined,
        assigned_to: assignedTo || undefined,
        priority,
        estimated_hours: estimatedHours,
      }

      if (mode === 'reschedule') {
        rescheduleMutation.mutate(payload)
      } else {
        createMutation.mutate(payload)
      }
    },
    [
      validate,
      isSubmitting,
      scheduledAt,
      title,
      notes,
      assignedTo,
      priority,
      estimatedHours,
      mode,
      createMutation,
      rescheduleMutation,
    ],
  )

  const handleCancelFollowUp = useCallback(() => {
    if (!followUpData?.id || cancelMutation.isLoading) return
    cancelMutation.mutate()
  }, [followUpData, cancelMutation])

  const handleQuickDate = useCallback(
    (offsetDays) => {
      const now = timeService.nowLocal ? timeService.nowLocal() : new Date()
      const d = addDays(now, offsetDays)
      // Keep the current time of day, don't reset to midnight
      d.setHours(now.getHours(), now.getMinutes(), 0, 0)
      // Round to next 30-minute slot
      d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30)
      setScheduledAt(toDatetimeLocal(d))
    },
    [],
  )

  // ── Render ──────────────────────────────────────────────────────────────
  if (!open) return null

  const isReschedule = mode === 'reschedule'
  const leadName = currentLead?.company_name || currentLead?.prospect_name || ''
  const stageName = currentLead?.current_stage || ''
  const hasNoLead = !initialLead && !leadId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose?.()
      }}
    >
      <div
        className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader
          title={isReschedule ? 'Reschedule Follow-up' : 'Schedule Follow-up'}
          subtitle={
            leadName
              ? `${leadName} — ${stageName}`
              : 'Select a lead and choose a follow-up time'
          }
          onClose={isSubmitting ? undefined : onClose}
        />

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {/* Lead selector (when opened without a preselected lead) */}
            {hasNoLead && (
              <FormField label="Lead" required hint="Type at least 2 characters to search">
                <div className="relative">
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => {
                      setLeadSearch(e.target.value)
                      setSelectedLeadId('')
                      setCurrentLead(null)
                    }}
                    placeholder="Search leads..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  {leadsLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
                {leadsList.length > 0 && !selectedLeadId && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                    {leadsList.map((l) => (
                      <button
                        key={l.id || l._id}
                        type="button"
                        onClick={() => {
                          setSelectedLeadId(l.id || l._id)
                          setLeadSearch(l.company_name || l.prospect_name || 'Lead')
                          setLeadsList([])
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-900 dark:text-white">
                            {l.company_name || l.prospect_name || 'Lead'}
                          </div>
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {l.current_stage || 'No stage'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {errors.lead && (
                  <p className="mt-1 text-xs text-rose-500">{errors.lead}</p>
                )}
              </FormField>
            )}

            {/* Title */}
            <FormField label="Follow-up title" required>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Follow up with Acme Corp"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-rose-500">{errors.title}</p>
              )}
            </FormField>

            {/* Notes */}
            <FormField label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Call regarding revised proposal..."
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </FormField>

            {/* Quick date options */}
            <div className="space-y-2">
              <FormField label="Quick schedule">
                <div className="flex flex-wrap gap-2">
                  {QUICK_DATE_OPTIONS.map((opt) => {
                    const optDate = addDays(new Date(), opt.offsetDays)
                    const isActive =
                      scheduledAt &&
                      new Date(scheduledAt).toDateString() === optDate.toDateString()
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handleQuickDate(opt.offsetDays)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          isActive
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {isActive && <Check className="h-3 w-3" />}
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </FormField>
            </div>

            {/* Date and time */}
            <FormField label="Follow-up date & time" required>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              {errors.scheduledAt && (
                <p className="mt-1 text-xs text-rose-500">{errors.scheduledAt}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Times are in your local timezone and converted to UTC.
              </p>
            </FormField>

            {/* Assignee */}
            <FormField label="Assign to">
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                {users.length === 0 && (
                  <option value="">No users available</option>
                )}
                {users.map((u) => {
                  const id = String(u.id || u._id || '')
                  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || id
                  return (
                    <option key={id} value={id}>
                      {name} {u.role ? `(${u.role})` : ''}
                    </option>
                  )
                })}
              </select>
            </FormField>

            {/* Priority & estimated hours */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Priority">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Est. hours" hint="Default 0.5h">
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </FormField>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            {isReschedule && followUpData?.id ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={cancelMutation.isLoading}
                onClick={handleCancelFollowUp}
                disabled={isSubmitting}
              >
                Cancel Follow-up
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Close
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                loadingText={isReschedule ? 'Rescheduling...' : 'Scheduling...'}
                disabled={isSubmitting || (!leadId && !initialLead)}
              >
                <CalendarClock className="h-4 w-4" />
                {isReschedule ? 'Reschedule' : 'Schedule Follow-up'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
