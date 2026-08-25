import { describe, expect, it } from 'vitest'
import { buildBreadcrumbTrail } from './breadcrumbs'

describe('buildBreadcrumbTrail (Phase 5, spec §10.5)', () => {
  it('starts every trail with Home', () => {
    expect(buildBreadcrumbTrail('/dashboard')[0]).toBe('Home')
    expect(buildBreadcrumbTrail('/projects')[0]).toBe('Home')
    expect(buildBreadcrumbTrail('/chat')[0]).toBe('Home')
  })

  it('shows just Home for /dashboard', () => {
    expect(buildBreadcrumbTrail('/dashboard')).toEqual(['Home'])
  })

  it('shows Home / Work / Projects for /projects', () => {
    expect(buildBreadcrumbTrail('/projects')).toEqual(['Home', 'Work', 'Projects'])
  })

  it('shows Home / Sales / Leads for CRM leads', () => {
    expect(buildBreadcrumbTrail('/crm/leads')).toEqual(['Home', 'Sales', 'Leads'])
  })

  it('appends Lead to a lead workspace route', () => {
    expect(buildBreadcrumbTrail('/crm/leads/abc123')).toEqual(['Home', 'Sales', 'Leads', 'Lead'])
  })

  it('appends Company to a company workspace route', () => {
    expect(buildBreadcrumbTrail('/crm/companies/abc123')).toEqual(['Home', 'Clients', 'Companies', 'Company'])
  })

  it('maps a direct task detail under Work > Tasks', () => {
    expect(buildBreadcrumbTrail('/tasks/abc123')).toEqual(['Home', 'Work', 'Tasks', 'Task Detail'])
  })

  it('maps a nested project task under Work > Projects > Tasks', () => {
    expect(buildBreadcrumbTrail('/projects/p1/tasks/t1')).toEqual(['Home', 'Work', 'Projects', 'Tasks', 'Task Detail'])
  })

  it('resolves meta channel panels to their Inbox item by query string', () => {
    expect(buildBreadcrumbTrail('/crm/settings', '?meta=whatsapp')).toEqual(['Home', 'Inbox', 'WhatsApp'])
    expect(buildBreadcrumbTrail('/crm/settings', '?meta=instagram')).toEqual(['Home', 'Inbox', 'Instagram'])
  })

  it('resolves plain CRM settings to Settings > Client Settings', () => {
    expect(buildBreadcrumbTrail('/crm/settings')).toEqual(['Home', 'Settings', 'Client Settings'])
  })

  it('shows sidebar names for renamed items (Requests, Scheduled Work, User Accounts)', () => {
    expect(buildBreadcrumbTrail('/tickets')).toEqual(['Home', 'Work', 'Requests'])
    expect(buildBreadcrumbTrail('/scheduled-jobs')).toEqual(['Home', 'Work', 'Scheduled Work'])
    // People → Employees is the HR employee-profile surface; /users is now User Accounts.
    expect(buildBreadcrumbTrail('/users')).toEqual(['Home', 'People', 'User Accounts'])
  })

  it('maps HR recruitment routes under People with renamed labels', () => {
    expect(buildBreadcrumbTrail('/hr/recruitment/jobs')).toEqual(['Home', 'People', 'Recruitment', 'Job Openings'])
    expect(buildBreadcrumbTrail('/hr/recruitment/jobs/6a85bad39652eaa89a110d2b')).toEqual(['Home', 'People', 'Recruitment', 'Job Openings', 'Job Detail'])
    expect(buildBreadcrumbTrail('/hr/recruitment/candidates/6a85bad39652eaa89a110d2b')).toEqual(['Home', 'People', 'Recruitment', 'Candidates', 'Candidate Detail'])
    expect(buildBreadcrumbTrail('/hr/recruitment/reports')).toEqual(['Home', 'People', 'Recruitment', 'Hiring Reports'])
  })

  it('maps canonical HR employee/documents routes under People', () => {
    expect(buildBreadcrumbTrail('/hr/employees')).toEqual(['Home', 'People', 'Employees'])
    expect(buildBreadcrumbTrail('/hr/employees/emp-1')).toEqual(['Home', 'People', 'Employees', 'Employee Profile'])
    expect(buildBreadcrumbTrail('/hr/documents')).toEqual(['Home', 'People', 'Documents'])
    expect(buildBreadcrumbTrail('/hr/settings/document-types')).toEqual(['Home', 'People', 'HR Settings', 'Document Types'])
  })

  it('maps finance, insights, content and AI pages to their sections', () => {
    expect(buildBreadcrumbTrail('/invoices')).toEqual(['Home', 'Finance', 'Invoices'])
    expect(buildBreadcrumbTrail('/ledger')).toEqual(['Home', 'Finance', 'Transactions'])
    expect(buildBreadcrumbTrail('/reports')).toEqual(['Home', 'Insights', 'Workspace Reports'])
    expect(buildBreadcrumbTrail('/content-calendar')).toEqual(['Home', 'Content', 'Content Calendar'])
    expect(buildBreadcrumbTrail('/ai-hub')).toEqual(['Home', 'AI Workspace', 'AI Assistant'])
    expect(buildBreadcrumbTrail('/marketing-support')).toEqual(['Home', 'AI Workspace', 'AI Content Assistant'])
  })

  it('prefixes non-sidebar routes (chat, meetings) with Home only', () => {
    expect(buildBreadcrumbTrail('/chat')).toEqual(['Home', 'Chat'])
    expect(buildBreadcrumbTrail('/meetings')).toEqual(['Home', 'Meetings'])
  })

  it('maps section landing pages to Home → Section (tab sub-nav D1)', () => {
    expect(buildBreadcrumbTrail('/sections/clients')).toEqual(['Home', 'Clients'])
    expect(buildBreadcrumbTrail('/sections/work')).toEqual(['Home', 'Work'])
    expect(buildBreadcrumbTrail('/sections/settings')).toEqual(['Home', 'Settings'])
  })

  it('shows just Home for the Home section landing page', () => {
    expect(buildBreadcrumbTrail('/sections/home')).toEqual(['Home'])
  })
})
