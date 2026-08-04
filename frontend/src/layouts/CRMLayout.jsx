import { Outlet } from 'react-router-dom'

// The horizontal tab navigation for every /crm route is rendered by the global
// SectionTabs bar mounted in MainLayout — Sales section for /crm/pipeline and
// /crm/leads, Clients for /crm/companies | /crm/contacts | /crm/calendar |
// /crm/reports, Settings for /crm/settings, Inbox for /crm/inbox. That bar is
// compact, follows the URL (deep-link / refresh safe), and sits above the page
// content, so this layout must NOT render its own tab bar or heading wrapper.
// CRM pages render their own headings, search and content.
const CRMLayout = () => <Outlet />

export default CRMLayout
