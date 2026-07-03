import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, Building2, CalendarDays, Clock3, FileText, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Skeleton, inputClassName } from '../../../components/ui'
import { ContactFormModal } from '../contacts/components'
import {
  CompanyAccessDeniedState,
  CompanyLeadTable,
  CompanyPlaceholderTab,
  CompanyStats,
  CompanyTabs,
  CompanyTimeline,
  CompanyOverview,
} from './components'

const TAB_KEY = 'tab'

export default function CRMCompanyWorkspacePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { companyId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [editingCompany, setEditingCompany] = useState(null)
  const [deleteContactId, setDeleteContactId] = useState(null)
  const [deleteCompany, setDeleteCompany] = useState(false)

  const activeTab = searchParams.get(TAB_KEY) || 'overview'

  const companyQuery = useQuery(['crm-company', companyId], () => crmApi.getCompany(companyId), {
    enabled: Boolean(companyId),
    retry: false,
    staleTime: 60 * 1000,
  })

  const company = companyQuery.data?.company || null
  const contactsData = companyQuery.data?.contacts
  const leadsData = companyQuery.data?.leads
  const contacts = useMemo(() => (Array.isArray(contactsData) ? contactsData : []), [contactsData])
  const leads = useMemo(() => (Array.isArray(leadsData) ? leadsData : []), [leadsData])
  const timeline = companyQuery.data?.timeline || {}
  const errorStatus = companyQuery.error?.response?.status
  const dealQueries = useMemo(() => leads.map((lead) => ({ leadId: lead.id, lead })), [leads])
  const dealContextQuery = useQuery(
    ['crm-company-deals', companyId, dealQueries.map((item) => item.leadId).join(',')],
    async () => {
      if (!dealQueries.length) return []
      const results = await Promise.allSettled(dealQueries.map((item) => Promise.all([
        crmApi.getLeadDeal(item.leadId),
        crmApi.getLeadProposals(item.leadId),
      ])))
      return results.map((result, index) => {
        const lead = dealQueries[index].lead
        if (result.status !== 'fulfilled') {
          return { lead, deal: null, proposals: [] }
        }
        const [dealResponse, proposalResponse] = result.value
        return {
          lead,
          deal: dealResponse?.data?.deal || null,
          proposals: Array.isArray(proposalResponse?.data?.proposals) ? proposalResponse.data.proposals : [],
        }
      })
    },
    {
      enabled: Boolean(companyId) && leads.length > 0,
      retry: false,
      staleTime: 60 * 1000,
    }
  )
  const dealContexts = Array.isArray(dealContextQuery.data) ? dealContextQuery.data : []
  const activeDealContext = dealContexts.find((item) => item.deal && !item.deal.archived) || dealContexts.find((item) => item.deal) || null

  const updateCompanyMutation = useMutation((payload) => crmApi.updateCompany(companyId, payload), {
    onSuccess: () => {
      toast.success('Company updated')
      setEditingCompany(null)
      queryClient.invalidateQueries(['crm-company', companyId], { exact: true })
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const deleteCompanyMutation = useMutation(() => crmApi.deleteCompany(companyId), {
    onSuccess: () => {
      toast.success('Company deleted')
      navigate('/crm/companies')
    },
  })

  const deleteContactMutation = useMutation((contactId) => crmApi.deleteContact(contactId), {
    onSuccess: () => {
      toast.success('Contact deleted')
      setDeleteContactId(null)
      queryClient.invalidateQueries(['crm-company', companyId], { exact: true })
      queryClient.invalidateQueries('crm-contacts')
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const createContactMutation = useMutation((payload) => crmApi.createContact(payload), {
    onSuccess: () => {
      toast.success('Contact created')
      setContactModalOpen(false)
      setEditingContact(null)
      queryClient.invalidateQueries(['crm-company', companyId], { exact: true })
      queryClient.invalidateQueries('crm-contacts')
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const updateContactMutation = useMutation(({ contactId, payload }) => crmApi.updateContact(contactId, payload), {
    onSuccess: () => {
      toast.success('Contact updated')
      setContactModalOpen(false)
      setEditingContact(null)
      queryClient.invalidateQueries(['crm-company', companyId], { exact: true })
      queryClient.invalidateQueries('crm-contacts')
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const companyContacts = useMemo(() => contacts, [contacts])

  const handleTabChange = (tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (tab && tab !== 'overview') next.set(TAB_KEY, tab)
      else next.delete(TAB_KEY)
      return next
    }, { replace: true })
  }

  if (!companyId) {
    return (
      <CRMPage>
        <CRMSection title="Company workspace" description="Open a company from the CRM directory to view its workspace.">
          <CRMEmptyState
            icon={Building2}
            title="No company selected"
            description="Go to the CRM companies page and open any company."
            action={<Button onClick={() => navigate('/crm/companies')}>Open companies</Button>}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  if (companyQuery.isLoading) {
    return (
      <CRMPage>
        <CRMSection title="Company workspace" description="Loading company data.">
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-28 w-full" />
              ))}
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CRMSection>
      </CRMPage>
    )
  }

  if (errorStatus === 403) {
    return <CompanyAccessDeniedState onBack={() => navigate('/crm/companies')} />
  }

  if (companyQuery.isError || !company) {
    return (
      <CRMPage>
        <CRMSection title="Company workspace" description="Could not load the selected company.">
          <EmptyState
            icon={Building2}
            title="Company not found"
            description="The selected company does not exist or could not be loaded."
            action={<Button onClick={() => navigate('/crm/companies')}>Back to companies</Button>}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  const onSaveCompany = (payload) => {
    updateCompanyMutation.mutate(payload)
  }

  const onSaveContact = (payload) => {
    if (editingContact) {
      updateContactMutation.mutate({ contactId: editingContact.id, payload })
      return
    }
    createContactMutation.mutate({ ...payload, crm_company_id: companyId })
  }

  let tabBody
  if (activeTab === 'contacts') {
    tabBody = (
      <CRMSection
        title="Contacts"
        description="Every company can own multiple contacts. The primary contact is highlighted."
        actions={(
          <Button onClick={() => { setEditingContact(null); setContactModalOpen(true) }}>
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        )}
      >
        {companyContacts.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Name', 'Role', 'Primary', 'Email', 'Phone', 'Actions'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {companyContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{contact.full_name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{contact.owner_name || 'No owner'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{contact.designation || '—'}</td>
                      <td className="px-4 py-3">
                        {contact.is_primary_contact ? <Badge label="Primary" colorKey="emerald" /> : <Badge label="Secondary" colorKey="draft" />}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{contact.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{`${contact.country_code || ''} ${contact.phone || ''}`}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => { setEditingContact(contact); setContactModalOpen(true) }}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteContactId(contact.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState
            icon={Plus}
            title="No contacts yet"
            description="Create the first company contact to make this workspace useful."
            action={<Button onClick={() => setContactModalOpen(true)}>Add contact</Button>}
          />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'leads') {
    tabBody = (
      <CRMSection title="Leads" description="Leads linked to this CRM company.">
        <CompanyLeadTable leads={leads} />
      </CRMSection>
    )
  } else if (activeTab === 'notes') {
    tabBody = <CompanyPlaceholderTab title="Notes" description="Company-scoped notes will be added here later." />
  } else if (activeTab === 'files') {
    tabBody = <CompanyPlaceholderTab title="Files" description="Company-scoped files will be added here later." icon={FileText} />
  } else if (activeTab === 'meetings') {
    tabBody = <CompanyPlaceholderTab title="Meetings" description="Meeting history will land here once company-level meetings are wired." icon={CalendarDays} />
  } else if (activeTab === 'timeline') {
    tabBody = (
      <CRMSection title="Timeline" description="Chronological company activity from CRM events and related lead activity.">
        <CompanyTimeline timeline={timeline} />
      </CRMSection>
    )
  } else if (activeTab === 'deals') {
    tabBody = (
      <CRMSection title="Deals" description="Active deal context sourced from lead-level CRM deal APIs.">
        {dealContextQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : activeDealContext ? (
          <div className="space-y-4">
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Active deal</p>
              <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{activeDealContext.lead?.prospect_name || activeDealContext.lead?.company_name || 'Lead deal'}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Badge label={`Value ${activeDealContext.deal?.value ?? 0}`} colorKey="draft" />
                <Badge label={`Status ${activeDealContext.deal?.stage || 'qualified'}`} colorKey="draft" />
                <Badge label={`Proposal ${activeDealContext.deal?.latest_proposal_status || 'draft'}`} colorKey="draft" />
                <Badge label={`Versions ${activeDealContext.proposals.length}`} colorKey="draft" />
              </div>
            </article>
            <div className="space-y-3">
              {activeDealContext.proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{proposal.title}</h4>
                    <Badge label={`v${proposal.version}`} colorKey="draft" />
                    <Badge label={proposal.status} colorKey="draft" />
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{proposal.summary || 'No summary provided.'}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <CRMEmptyState
            icon={FileText}
            title="No active deal"
            description="This company does not yet have a CRM deal context."
          />
        )}
      </CRMSection>
    )
  } else {
    tabBody = (
      <div className="space-y-6">
        <CompanyOverview company={company} contacts={contacts} leads={leads} />
        <CompanyStats company={company} contacts={contacts} leads={leads} />
      </div>
    )
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Company Workspace"
        title={company.name}
        description="Source of truth for the company, its contacts and linked leads."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link className="btn btn-secondary" to={`/crm/activities?entity_type=company&entity_id=${companyId}`}>
              <Activity className="h-4 w-4" />
              Activities
            </Link>
            <Button variant="secondary" size="sm" onClick={() => navigate('/crm/companies')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setEditingCompany(company) }}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleteCompany(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      />

      <CompanyOverview company={company} contacts={contacts} leads={leads} />

      <div className="grid gap-4 md:grid-cols-4">
        <CRMStatCard icon={Activity} label="Active deal" value={activeDealContext?.lead?.prospect_name || 'None'} tone="blue" />
        <CRMStatCard icon={FileText} label="Deal value" value={String(activeDealContext?.deal?.value ?? 0)} tone="emerald" />
        <CRMStatCard icon={CalendarDays} label="Proposal versions" value={String(activeDealContext?.proposals?.length ?? 0)} tone="amber" />
        <CRMStatCard icon={Clock3} label="Proposal status" value={activeDealContext?.deal?.latest_proposal_status || 'draft'} tone="slate" />
      </div>

      <CompanyTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {tabBody}

      <ContactFormModal
        isOpen={contactModalOpen}
        onClose={() => { setContactModalOpen(false); setEditingContact(null) }}
        onSave={onSaveContact}
        title={editingContact ? 'Edit contact' : 'Add contact'}
        contact={editingContact}
        lockedCompanyId={companyId}
      />

      <Modal
        isOpen={Boolean(editingCompany)}
        onClose={() => setEditingCompany(null)}
        title="Edit company"
        size="xl"
      >
        {editingCompany ? (
          <CompanyFormShell initialCompany={editingCompany} onSave={onSaveCompany} onCancel={() => setEditingCompany(null)} />
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={deleteCompany}
        onClose={() => setDeleteCompany(false)}
        onConfirm={() => deleteCompanyMutation.mutate()}
        loading={deleteCompanyMutation.isLoading}
        title="Delete company"
        message="The company will be removed from the CRM workspace."
        confirmLabel="Delete"
      />

      <ConfirmDialog
        isOpen={Boolean(deleteContactId)}
        onClose={() => setDeleteContactId(null)}
        onConfirm={() => deleteContactMutation.mutate(deleteContactId)}
        loading={deleteContactMutation.isLoading}
        title="Delete contact"
        message="The contact will be removed from this company."
        confirmLabel="Delete"
      />
    </CRMPage>
  )
}

function CompanyFormShell({ initialCompany, onSave, onCancel }) {
  const [form, setForm] = useState(initialCompany || {})
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {['name', 'email', 'phone', 'website', 'industry', 'company_size'].map((key) => (
        <label key={key} className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{key.replace('_', ' ')}</span>
          <input className={inputClassName} value={form[key] || ''} onChange={(event) => update(key, event.target.value)} />
        </label>
      ))}
      <label className="block md:col-span-2">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Notes</span>
        <textarea className={`${inputClassName} min-h-28`} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} />
      </label>
      <div className="md:col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name}>Save changes</Button>
      </div>
    </div>
  )
}
