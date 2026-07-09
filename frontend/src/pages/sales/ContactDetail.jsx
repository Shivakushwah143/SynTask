import { useState } from 'react'
import { useQuery } from 'react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, User, FileText } from 'lucide-react'
import { crmApi } from '../../api/crm'
import { salesApi } from '../../api/sales'
import { Badge, Button, EmptyState, SkeletonCard, PageHeader } from '../../components/ui'
import { CRMSection, CRMStatCard, CRMEmptyState } from '../../components/crm'
import { EmailComposer } from '../../components/EmailComposer'
import { formatDate } from '../phase4Utils'

export default function ContactDetail() {
  const { id } = useParams()
  const [composerOpen, setComposerOpen] = useState(false)
  const { data, isLoading, isError } = useQuery(['sales-contact', id], () => salesApi.getContact(id), { enabled: Boolean(id) })
  const crmContactQuery = useQuery(['crm-contact', id], () => crmApi.getContact(id), { enabled: Boolean(id), retry: false })
  const crmCompanyId = crmContactQuery.data?.contact?.crm_company_id
  const companyDealQuery = useQuery(['crm-contact-deal', crmCompanyId], () => crmApi.getCompany(crmCompanyId), { enabled: Boolean(crmCompanyId), retry: false, staleTime: 60 * 1000 })
  const companyLeads = Array.isArray(companyDealQuery.data?.leads) ? companyDealQuery.data.leads : []
  const activeLead = companyLeads.find((lead) => String(lead.contact_id || '') === String(id)) || companyLeads[0] || null
  const leadProposalQuery = useQuery(['crm-contact-proposals', activeLead?.id], () => crmApi.getLeadProposals(activeLead.id), { enabled: Boolean(activeLead?.id), retry: false, staleTime: 60 * 1000 })

  if (isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>
  if (isError || !data) return <div className="p-6"><EmptyState icon={User} title="Contact not found" /></div>

  return (
    <>
      <div className="p-6">
        <PageHeader
          title={`${data.first_name || ''} ${data.last_name || ''}`}
          description={data.company_name || 'Sales contact'}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => setComposerOpen(true)}>
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
              <Link to="/sales/contacts"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>
            </div>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Email" value={data.email} />
          <Info label="Phone" value={`${data.country_code || ''} ${data.phone || ''}`} />
          <Info label="Company" value={data.company_name} />
          <Info label="Designation" value={data.designation} />
          <Info label="Channel" value={data.channel ? <Badge label={data.channel} /> : '-'} />
          <Info label="Created" value={formatDate(data.created_at)} />
        </div>

        <CRMSection title="Deal & Proposal" description="Read-only CRM integration from the linked company context.">
          {crmContactQuery.isLoading || companyDealQuery.isLoading || leadProposalQuery.isLoading ? (
            <SkeletonCard lines={4} />
          ) : activeLead ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <CRMStatCard icon={FileText} label="Active deal" value={activeLead.prospect_name || activeLead.company_name || 'Lead'} tone="blue" />
                <CRMStatCard icon={FileText} label="Deal value" value={String(activeLead.won_amount ?? activeLead.deal_value ?? 0)} tone="emerald" />
                <CRMStatCard icon={FileText} label="Proposal versions" value={String(Array.isArray(leadProposalQuery.data?.proposals) ? leadProposalQuery.data.proposals.length : 0)} tone="amber" />
                <CRMStatCard icon={FileText} label="Proposal status" value={leadProposalQuery.data?.deal?.latest_proposal_status || 'draft'} tone="slate" />
              </div>
              <div className="space-y-2">
                {(Array.isArray(leadProposalQuery.data?.proposals) ? leadProposalQuery.data.proposals : []).map((proposal) => (
                  <article key={proposal.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-900">{proposal.title}</p>
                    <p className="mt-1 text-xs text-gray-500">Version {proposal.version} Â· {proposal.status}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <CRMEmptyState icon={FileText} title="No CRM deal linked" description="This contact does not currently have a linked deal context." />
          )}
        </CRMSection>
      </div>
      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: data.email ? [{ email: data.email, name: `${data.first_name || ''} ${data.last_name || ''}`.trim() }] : [],
          subject: `${data.first_name || 'Hello'} ${data.last_name || ''}`.trim(),
          html: '<p>Hi,</p><p></p>',
          text: 'Hi,',
          related_entity_type: 'contact',
          related_entity_id: id,
          related_module: 'sales',
        }}
      />
    </>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}
