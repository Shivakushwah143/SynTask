// SynTask v3.0 — Breadcrumb trail builder (Phase 5, spec §10.5).
// Every trail starts with "Home" and reads "Home → Section → Page", reusing the
// sidebar section labels + item names from config/navigation.js so the header
// breadcrumb always matches what the user sees in the sidebar.

import { getNavContextForPath, SECTIONS } from '../config/navigation'

export const BREADCRUMB_LABELS = {
  dashboard: 'Home',
  tasks: 'Tasks',
  tickets: 'Service Requests',
  chat: 'Chat',
  projects: 'Projects',
  calendar: 'Workspace Calendar',
  meetings: 'Meetings',
  notifications: 'Notifications',
  crm: 'CRM',
  hr: 'People',
  recruitment: 'Recruitment',
  jobs: 'Job Openings',
  inbox: 'Applications',
  candidates: 'Candidates',
  'resume-pool': 'Talent Pool',
  interviews: 'Interviews',
  reports: 'Workspace Reports',
  settings: 'System Settings',
  eod: 'Daily Updates',
  marketing: 'Marketing',
  'ai-assistant': 'AI Assistant',
  'ai-prioritization': 'AI Prioritization',
  'time-tracking': 'Time Tracking',
  board: 'Board',
  activities: 'Activities',
  'my-team': 'My Team',
}

export const CRM_BREADCRUMB_LABELS = {
  pipeline: 'Pipeline',
  dashboard: 'Pipeline',
  leads: 'Leads',
  companies: 'Companies',
  contacts: 'Contacts',
  calendar: 'Client Calendar',
  reports: 'Client Insights',
  settings: 'Client Settings',
  activities: 'Activities',
}

// Builds the breadcrumb trail for a route. Returns e.g. ['Home'], ['Home', 'Work', 'Projects'],
// ['Home', 'Inbox', 'WhatsApp'], ['Home', 'Sales', 'Leads', 'Lead'].
export const buildBreadcrumbTrail = (pathname, search = '') => {
  const segments = pathname.split('/').filter(Boolean)

  // Section landing pages (tab sub-nav plan, D1): /sections/:key → Home → Section.
  const sectionMatch = pathname.match(/^\/sections\/([^/]+)/)
  if (sectionMatch) {
    const section = SECTIONS.find((s) => s.key === sectionMatch[1])
    if (section) return section.label === 'Home' ? ['Home'] : ['Home', section.label]
  }

  const context = getNavContextForPath(pathname, search)

  // Routes that live in the sidebar: Home → Section → Page (sidebar labels).
  if (context) {
    const trail = ['Home']
    if (context.sectionLabel !== 'Home') trail.push(context.sectionLabel)
    // The Home section's own landing item is also named 'Home' — don't duplicate it.
    if (context.itemName !== 'Home') trail.push(context.itemName)

    // Detail pages keep their readable suffix instead of the raw MongoDB ID.
    const isLeadWorkspace = segments.length === 3 && segments[0] === 'crm' && segments[1] === 'leads'
    const isCompanyWorkspace = segments.length === 3 && segments[0] === 'crm' && segments[1] === 'companies'
    const isTaskDetail = segments.length === 4 && segments[0] === 'projects' && segments[2] === 'tasks'
    const isDirectTaskDetail = segments.length === 2 && segments[0] === 'tasks'
    const isRecruitmentJobDetail = segments.length === 4 && segments[0] === 'hr' && segments[1] === 'recruitment' && segments[2] === 'jobs'
    const isRecruitmentCandidateDetail = segments.length === 4 && segments[0] === 'hr' && segments[1] === 'recruitment' && segments[2] === 'candidates'

    if (isLeadWorkspace) trail.push('Lead')
    else if (isCompanyWorkspace) trail.push('Company')
    else if (isTaskDetail) trail.push('Tasks', 'Task Detail')
    else if (isDirectTaskDetail) trail.push('Task Detail')
    else if (isRecruitmentJobDetail) trail.push('Job Detail')
    else if (isRecruitmentCandidateDetail) trail.push('Candidate Detail')
    else if (!context.matchedExact) {
      // Other sub-pages (e.g. /projects/:id/board): append labelled remainder.
      const matchedDepth = context.itemPath.split('/').filter(Boolean).length
      for (const segment of segments.slice(matchedDepth)) {
        const label = BREADCRUMB_LABELS[segment] || CRM_BREADCRUMB_LABELS[segment]
        if (label) trail.push(label)
      }
    }
    return trail
  }

  // Routes not present in the sidebar (chat, meetings, HR screens, ...):
  // Home prefix + the legacy segment label maps.
  const isCrmPath = segments[0] === 'crm'
  const isHrPath = segments[0] === 'hr'
  const labelSegment = (segment, index) => {
    if (isCrmPath && index > 0) return CRM_BREADCRUMB_LABELS[segment] || BREADCRUMB_LABELS[segment] || segment
    if (isHrPath && segment === 'reports') return 'Hiring Reports'
    return BREADCRUMB_LABELS[segment] || segment
  }
  let displaySegments = segments.map(labelSegment)

  const isLeadWorkspace = segments.length === 3 && segments[0] === 'crm' && segments[1] === 'leads'
  const isCompanyWorkspace = segments.length === 3 && segments[0] === 'crm' && segments[1] === 'companies'
  const isTaskDetail = segments.length === 4 && segments[0] === 'projects' && segments[2] === 'tasks'
  const isDirectTaskDetail = segments.length === 2 && segments[0] === 'tasks'
  const isRecruitmentJobDetail = segments.length === 4 && segments[0] === 'hr' && segments[1] === 'recruitment' && segments[2] === 'jobs'
  const isRecruitmentCandidateDetail = segments.length === 4 && segments[0] === 'hr' && segments[1] === 'recruitment' && segments[2] === 'candidates'
  if (isLeadWorkspace) displaySegments = [displaySegments[0], displaySegments[1], 'Lead']
  else if (isCompanyWorkspace) displaySegments = [displaySegments[0], displaySegments[1], 'Company']
  else if (isTaskDetail) displaySegments = ['Projects', displaySegments[1], 'Tasks', 'Task Detail']
  else if (isDirectTaskDetail) displaySegments = ['Tasks', 'Task Detail']
  else if (isRecruitmentJobDetail) displaySegments = ['Recruitment', 'Job Openings', 'Job Detail']
  else if (isRecruitmentCandidateDetail) displaySegments = ['Recruitment', 'Candidates', 'Candidate Detail']

  if (displaySegments[0] === 'CRM' || displaySegments[0] === 'HR') displaySegments = displaySegments.slice(1)
  return ['Home', ...displaySegments]
}
