import { memo, useEffect, useState } from 'react'
import { FormField, Modal, PhoneInput, inputClassName, isValidLocalPhone } from '../../../components/ui'

const CONTACT_TEMPLATE = {
  first_name: '',
  last_name: '',
  country_code: '+91',
  phone: '',
  email: '',
  designation: '',
  channel: '',
  relationship_type: '',
  owner_name: '',
  owner_contact_no: '',
  tag: '',
  crm_company_id: '',
  is_primary_contact: false,
}

export const ContactFormModal = memo(function ContactFormModal({
  isOpen,
  onClose,
  onSave,
  title = 'Contact',
  contact = null,
  companyOptions = [],
  lockedCompanyId = '',
}) {
  const [form, setForm] = useState(CONTACT_TEMPLATE)

  useEffect(() => {
    if (!isOpen) return
    setForm({
      ...CONTACT_TEMPLATE,
      ...contact,
      tag: Array.isArray(contact?.tag) ? contact.tag.join(', ') : (contact?.tag || ''),
      crm_company_id: lockedCompanyId || contact?.crm_company_id || '',
      is_primary_contact: Boolean(contact?.is_primary_contact),
    })
  }, [contact, isOpen, lockedCompanyId])

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="First name" required>
          <input className={inputClassName} value={form.first_name} onChange={(event) => update('first_name', event.target.value)} />
        </FormField>
        <FormField label="Last name" required>
          <input className={inputClassName} value={form.last_name} onChange={(event) => update('last_name', event.target.value)} />
        </FormField>
        <FormField label="Phone" required className="md:col-span-2">
          <PhoneInput
            countryCode={form.country_code}
            phoneNumber={form.phone}
            onCountryCodeChange={(value) => update('country_code', value)}
            onPhoneNumberChange={(value) => update('phone', value)}
            required
          />
        </FormField>
        <FormField label="Email">
          <input className={inputClassName} value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField label="Company" required>
          <select
            className={inputClassName}
            value={form.crm_company_id}
            onChange={(event) => update('crm_company_id', event.target.value)}
            disabled={Boolean(lockedCompanyId)}
          >
            <option value="">Select company</option>
            {companyOptions.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Designation">
          <input className={inputClassName} value={form.designation} onChange={(event) => update('designation', event.target.value)} />
        </FormField>
        <FormField label="Channel">
          <input className={inputClassName} value={form.channel} onChange={(event) => update('channel', event.target.value)} />
        </FormField>
        <FormField label="Relationship type">
          <input className={inputClassName} value={form.relationship_type} onChange={(event) => update('relationship_type', event.target.value)} />
        </FormField>
        <FormField label="Owner name">
          <input className={inputClassName} value={form.owner_name} onChange={(event) => update('owner_name', event.target.value)} />
        </FormField>
        <FormField label="Owner contact">
          <PhoneInput className={inputClassName} value={form.owner_contact_no} onChange={(event) => update('owner_contact_no', event.target.value)} />
        </FormField>
        <FormField label="Tags" className="md:col-span-2">
          <input className={inputClassName} value={form.tag} onChange={(event) => update('tag', event.target.value)} placeholder="Comma separated tags" />
        </FormField>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={Boolean(form.is_primary_contact)}
          onChange={(event) => update('is_primary_contact', event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        Primary contact
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave?.({
            ...form,
            tag: String(form.tag || '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          })}
          disabled={!form.first_name || !form.last_name || !isValidLocalPhone(form.phone) || !form.crm_company_id}
        >
          Save contact
        </button>
      </div>
    </Modal>
  )
})
