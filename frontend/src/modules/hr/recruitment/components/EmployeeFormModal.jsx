import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Building2, CalendarDays, Loader2, UserCog } from 'lucide-react'

import { Button, FormField, Modal, inputClassName } from '../../../../components/ui'
import { employeesApi } from '../../../../api/employees'

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Intern' },
  { value: 'temporary', label: 'Temporary' },
]

export const WORK_MODES = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
]

export const EMPLOYMENT_STATUSES = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'probation', label: 'Probation' },
  { value: 'active', label: 'Active' },
  { value: 'notice_period', label: 'Notice Period' },
  { value: 'exited', label: 'Exited' },
]

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'not_specified', label: 'Not specified' },
]

const selectClassName = inputClassName

const emptyForm = (overrides = {}) => ({
  user_id: '',
  employee_number: '',
  date_of_birth: '',
  gender: '',
  personal_email: '',
  personal_phone: '',
  address_line1: '',
  address_line2: '',
  address_city: '',
  address_state: '',
  address_postal_code: '',
  address_country: '',
  emergency_name: '',
  emergency_relationship: '',
  emergency_phone: '',
  emergency_alternate_phone: '',
  employment_type: '',
  joining_date: '',
  department_id: '',
  designation: '',
  reports_to: '',
  work_location: '',
  work_mode: '',
  employment_status: 'onboarding',
  probation_applicable: false,
  probation_start_date: '',
  probation_end_date: '',
  confirmation_date: '',
  exit_resignation_date: '',
  exit_last_working_day: '',
  exit_exit_date: '',
  exit_exit_reason: '',
  ...overrides,
})

const isDateString = (value) => {
  if (!value) return true
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const toApiPayload = (form, mode = 'create') => {
  const payload = {
    employee_number: form.employee_number?.trim() || null,
    date_of_birth: form.date_of_birth || null,
    gender: form.gender || null,
    personal_email: form.personal_email?.trim() || null,
    personal_phone: form.personal_phone?.trim() || null,
    address: {
      line1: form.address_line1?.trim() || null,
      line2: form.address_line2?.trim() || null,
      city: form.address_city?.trim() || null,
      state: form.address_state?.trim() || null,
      postal_code: form.address_postal_code?.trim() || null,
      country: form.address_country?.trim() || null,
    },
    emergency_contact: {
      name: form.emergency_name?.trim() || null,
      relationship: form.emergency_relationship?.trim() || null,
      phone: form.emergency_phone?.trim() || null,
      alternate_phone: form.emergency_alternate_phone?.trim() || null,
    },
    employment_type: form.employment_type || null,
    joining_date: form.joining_date || null,
    department_id: form.department_id || null,
    designation: form.designation?.trim() || null,
    reports_to: form.reports_to || null,
    work_location: form.work_location?.trim() || null,
    work_mode: form.work_mode || null,
  }

  // Only include lifecycle fields on create — they are rejected by update_profile()
  if (mode === 'create') {
    payload.employment_status = form.employment_status || 'onboarding'
    payload.probation = {
      applicable: Boolean(form.probation_applicable),
      start_date: form.probation_start_date || null,
      end_date: form.probation_end_date || null,
      confirmation_date: form.confirmation_date || null,
    }
    payload.exit_info = {
      resignation_date: form.exit_resignation_date || null,
      last_working_day: form.exit_last_working_day || null,
      exit_date: form.exit_exit_date || null,
      exit_reason: form.exit_exit_reason?.trim() || null,
    }
  }

  return payload
}

const fromDetail = (detail) => {
  const address = detail?.address || {}
  const emergency = detail?.emergency_contact || {}
  const probation = detail?.probation || {}
  const exitInfo = detail?.exit_info || {}
  return emptyForm({
    user_id: detail?.user_id || '',
    employee_number: detail?.employee_number || '',
    date_of_birth: detail?.date_of_birth ? String(detail.date_of_birth).slice(0, 10) : '',
    gender: detail?.gender || '',
    personal_email: detail?.personal_email || '',
    personal_phone: detail?.personal_phone || '',
    address_line1: address.line1 || '',
    address_line2: address.line2 || '',
    address_city: address.city || '',
    address_state: address.state || '',
    address_postal_code: address.postal_code || '',
    address_country: address.country || '',
    emergency_name: emergency.name || '',
    emergency_relationship: emergency.relationship || '',
    emergency_phone: emergency.phone || '',
    emergency_alternate_phone: emergency.alternate_phone || '',
    employment_type: detail?.employment_type || '',
    joining_date: detail?.joining_date ? String(detail.joining_date).slice(0, 10) : '',
    department_id: detail?.department_id || '',
    designation: detail?.designation || '',
    reports_to: detail?.manager_id || '',
    work_location: detail?.work_location || '',
    work_mode: detail?.work_mode || '',
    employment_status: detail?.employment_status || 'onboarding',
    probation_applicable: Boolean(probation.applicable),
    probation_start_date: probation.start_date ? String(probation.start_date).slice(0, 10) : '',
    probation_end_date: probation.end_date ? String(probation.end_date).slice(0, 10) : '',
    confirmation_date: probation.confirmation_date ? String(probation.confirmation_date).slice(0, 10) : '',
    exit_resignation_date: exitInfo.resignation_date ? String(exitInfo.resignation_date).slice(0, 10) : '',
    exit_last_working_day: exitInfo.last_working_day ? String(exitInfo.last_working_day).slice(0, 10) : '',
    exit_exit_date: exitInfo.exit_date ? String(exitInfo.exit_date).slice(0, 10) : '',
    exit_exit_reason: exitInfo.exit_reason || '',
  })
}

const SectionTitle = ({ icon: Icon, children }) => (
  <h3 className="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
    <Icon className="h-4 w-4 text-indigo-500" />
    {children}
  </h3>
)

export default function EmployeeFormModal({
  open,
  onClose,
  mode = 'create',
  initialData = null,
  departments = [],
  assignableUsers = [],
  onSaved,
}) {
  const isCreate = mode === 'create'
  const [form, setForm] = useState(() => emptyForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (isCreate) {
      setForm(emptyForm())
    } else {
      setForm(fromDetail(initialData))
    }
    setErrors({})
  }, [open, isCreate, initialData])

  const managerOptions = useMemo(() => {
    const source = assignableUsers || []
    const ownUserId = initialData?.user_id
    return source.filter((user) => !ownUserId || String(user.id) !== String(ownUserId))
  }, [assignableUsers, initialData])

  const setField = (field) => (event) => {
    const value = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const validate = () => {
    const nextErrors = {}
    if (isCreate && !form.user_id) {
      nextErrors.user_id = 'Please select a user'
    }
    const dateFieldsToCheck = ['date_of_birth', 'joining_date']
    if (isCreate) {
      dateFieldsToCheck.push('probation_start_date', 'probation_end_date', 'confirmation_date', 'exit_resignation_date', 'exit_last_working_day', 'exit_exit_date')
    }
    for (const field of dateFieldsToCheck) {
      if (!isDateString(form[field])) {
        nextErrors[field] = 'Enter a valid date'
      }
    }
    if (form.employee_number && form.employee_number.trim().length < 2) {
      nextErrors.employee_number = 'Employee number is too short'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    if (!validate()) return

    setSubmitting(true)
    try {
      const payload = toApiPayload(form, isCreate ? 'create' : 'edit')
      if (isCreate) {
        payload.user_id = form.user_id
      }
      const response = isCreate
        ? await employeesApi.create(payload)
        : await employeesApi.update(initialData.id, payload)
      const saved = response.data
      toast.success(isCreate ? 'Employee profile created' : 'Employee profile updated')
      onSaved?.(saved)
      onClose()
    } catch (error) {
      const detail = error?.response?.data?.detail
      const message = typeof detail === 'string' ? detail : 'Failed to save employee profile'
      toast.error(message)
      if (typeof detail === 'string' && detail.toLowerCase().includes('employee number')) {
        setErrors((prev) => ({ ...prev, employee_number: detail }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isCreate ? 'Add Employee' : `Edit ${initialData?.full_name || 'Employee'}`}
      description={
        isCreate
          ? 'Create an HR profile for an existing company user.'
          : 'Update HR employment and personal information.'
      }
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isCreate ? 'Create Profile' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* ── Employment ─────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionTitle icon={UserCog}>Employment</SectionTitle>

          {isCreate && (
            <FormField label="User" required error={errors.user_id}>
              <select
                className={selectClassName}
                value={form.user_id}
                onChange={setField('user_id')}
                aria-label="User"
              >
                <option value="">Select a company user…</option>
                {(assignableUsers || []).map((user) => (
                  <option key={user.id || user._id} value={user.id || user._id}>
                    {user.first_name} {user.last_name} ({user.email})
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Employee Number" error={errors.employee_number} helperText="Leave blank to auto-generate">
              <input className={inputClassName} value={form.employee_number} onChange={setField('employee_number')} placeholder="EMP-2026-0001" />
            </FormField>
            <FormField label="Employment Type">
              <select className={selectClassName} value={form.employment_type} onChange={setField('employment_type')} aria-label="Employment Type">
                <option value="">Not set</option>
                {EMPLOYMENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Department">
              <select className={selectClassName} value={form.department_id} onChange={setField('department_id')} aria-label="Department">
                <option value="">No department</option>
                {(departments || []).map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Designation">
              <input className={inputClassName} value={form.designation} onChange={setField('designation')} placeholder="e.g. Senior Engineer" />
            </FormField>
            <FormField label="Reporting Manager">
              <select className={selectClassName} value={form.reports_to} onChange={setField('reports_to')} aria-label="Reporting Manager">
                <option value="">No manager</option>
                {managerOptions.map((user) => (
                  <option key={user.id || user._id} value={user.id || user._id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Joining Date" error={errors.joining_date}>
              <input type="date" className={inputClassName} value={form.joining_date} onChange={setField('joining_date')} />
            </FormField>
            <FormField label="Work Mode">
              <select className={selectClassName} value={form.work_mode} onChange={setField('work_mode')} aria-label="Work Mode">
                <option value="">Not set</option>
                {WORK_MODES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Work Location">
              <input className={inputClassName} value={form.work_location} onChange={setField('work_location')} placeholder="e.g. Bangalore / Remote" />
            </FormField>
            <FormField label="Employment Status">
              <select className={selectClassName} value={form.employment_status} onChange={setField('employment_status')} aria-label="Employment Status">
                {EMPLOYMENT_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
          </div>
        </section>

        {/* ── Personal ───────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionTitle icon={Building2}>Personal Details</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Date of Birth" error={errors.date_of_birth}>
              <input type="date" className={inputClassName} value={form.date_of_birth} onChange={setField('date_of_birth')} />
            </FormField>
            <FormField label="Gender">
              <select className={selectClassName} value={form.gender} onChange={setField('gender')} aria-label="Gender">
                <option value="">Not specified</option>
                {GENDERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Personal Email">
              <input type="email" className={inputClassName} value={form.personal_email} onChange={setField('personal_email')} placeholder="personal@example.com" />
            </FormField>
            <FormField label="Personal Phone">
              <input className={inputClassName} value={form.personal_phone} onChange={setField('personal_phone')} placeholder="+91 98765 43210" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Address Line 1">
              <input className={inputClassName} value={form.address_line1} onChange={setField('address_line1')} />
            </FormField>
            <FormField label="Address Line 2">
              <input className={inputClassName} value={form.address_line2} onChange={setField('address_line2')} />
            </FormField>
            <FormField label="City">
              <input className={inputClassName} value={form.address_city} onChange={setField('address_city')} />
            </FormField>
            <FormField label="State">
              <input className={inputClassName} value={form.address_state} onChange={setField('address_state')} />
            </FormField>
            <FormField label="Postal Code">
              <input className={inputClassName} value={form.address_postal_code} onChange={setField('address_postal_code')} />
            </FormField>
            <FormField label="Country">
              <input className={inputClassName} value={form.address_country} onChange={setField('address_country')} />
            </FormField>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Emergency Contact</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Name">
                <input className={inputClassName} value={form.emergency_name} onChange={setField('emergency_name')} />
              </FormField>
              <FormField label="Relationship">
                <input className={inputClassName} value={form.emergency_relationship} onChange={setField('emergency_relationship')} placeholder="e.g. Spouse" />
              </FormField>
              <FormField label="Phone">
                <input className={inputClassName} value={form.emergency_phone} onChange={setField('emergency_phone')} />
              </FormField>
              <FormField label="Alternate Phone">
                <input className={inputClassName} value={form.emergency_alternate_phone} onChange={setField('emergency_alternate_phone')} />
              </FormField>
            </div>
          </div>
        </section>

        {/* ── Probation / Confirmation ───────────────────────────────────── */}
        <section className="space-y-4">
          <SectionTitle icon={CalendarDays}>Probation & Confirmation</SectionTitle>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={form.probation_applicable}
              onChange={setField('probation_applicable')}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Probation applicable
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Probation Start" error={errors.probation_start_date}>
              <input type="date" className={inputClassName} value={form.probation_start_date} onChange={setField('probation_start_date')} />
            </FormField>
            <FormField label="Probation End" error={errors.probation_end_date}>
              <input type="date" className={inputClassName} value={form.probation_end_date} onChange={setField('probation_end_date')} />
            </FormField>
            <FormField label="Confirmation Date" error={errors.confirmation_date}>
              <input type="date" className={inputClassName} value={form.confirmation_date} onChange={setField('confirmation_date')} />
            </FormField>
          </div>
        </section>

        {/* ── Exit information ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <SectionTitle icon={CalendarDays}>Exit Information</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Resignation Date" error={errors.exit_resignation_date}>
              <input type="date" className={inputClassName} value={form.exit_resignation_date} onChange={setField('exit_resignation_date')} />
            </FormField>
            <FormField label="Last Working Day" error={errors.exit_last_working_day}>
              <input type="date" className={inputClassName} value={form.exit_last_working_day} onChange={setField('exit_last_working_day')} />
            </FormField>
            <FormField label="Exit Date" error={errors.exit_exit_date}>
              <input type="date" className={inputClassName} value={form.exit_exit_date} onChange={setField('exit_exit_date')} />
            </FormField>
          </div>
          <FormField label="Exit Reason">
            <textarea
              className={`${inputClassName} min-h-20 resize-y`}
              value={form.exit_exit_reason}
              onChange={setField('exit_exit_reason')}
              placeholder="Optional"
            />
          </FormField>
        </section>
      </form>
    </Modal>
  )
}
