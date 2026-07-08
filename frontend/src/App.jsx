import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Loader from './components/Loader'
import { useUIStore } from './store/uiStore'
import { useAuthStore } from './store/authStore'
import { useTheme } from './hooks/useTheme'
import { PageLoader } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import ConfirmDialog from './components/ConfirmDialog'
import UndoBar from './components/UndoBar'
import { Agentation } from "agentation";
import { hasCompanyAdminAccess, isSuperAdminRole } from './utils/roles'
import { applySeoMeta, getSeoMeta } from './utils/seo'

const MainLayout = lazy(() => import('./layouts/MainLayout'))
const AuthLayout = lazy(() => import('./layouts/AuthLayout'))
const SalesLayout = lazy(() => import('./layouts/SalesLayout'))
const CRMLayout = lazy(() => import('./layouts/CRMLayout'))
const SuperAdminLayout = lazy(() => import('./layouts/SuperAdminLayout'))

const Login = lazy(() => import('./pages/auth/Login'))
const AdminRequest = lazy(() => import('./pages/auth/AdminRequest'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Landing = lazy(() => import('./pages/Landing'))
const NewLanding = lazy(() => import('./pages/NewLanding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Users = lazy(() => import('./pages/Users'))
const Departments = lazy(() => import('./pages/Departments'))
const AIPrioritization = lazy(() => import('./pages/AIPrioritization'))
const Companies = lazy(() => import('./pages/Companies'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const ActivityLog = lazy(() => import('./pages/ActivityLog'))
const Settings = lazy(() => import('./pages/Settings'))
const MyTeam = lazy(() => import('./pages/MyTeam'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectBoard = lazy(() => import('./pages/ProjectBoard'))
const TaskDetail = lazy(() => import('./pages/TaskDetail'))
const TimeTracking = lazy(() => import('./pages/TimeTracking'))
const Tickets = lazy(() => import('./pages/Tickets'))
const Chat = lazy(() => import('./pages/Chat'))
const Clients = lazy(() => import('./pages/Clients'))
const Invoices = lazy(() => import('./pages/Invoices'))
const MSA = lazy(() => import('./pages/MSA'))
const MSASign = lazy(() => import('./pages/MSASign'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Meetings = lazy(() => import('./pages/Meetings'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Timesheet = lazy(() => import('./pages/Timesheet'))
const Reports = lazy(() => import('./pages/Reports'))
const AIChat = lazy(() => import('./pages/AIChat'))
const AIHub = lazy(() => import('./pages/AIHub'))
const CreativeDirector = lazy(() => import('./pages/CreativeDirector'))
const MarketingChat = lazy(() => import('./pages/MarketingChat'))
const MarketingCalendar = lazy(() => import('./pages/marketing/calendar/page'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Attendance = lazy(() => import('./pages/attendance/Attendance'))
const LiveMonitor = lazy(() => import('./pages/attendance/LiveMonitor'))
const AttendanceReports = lazy(() => import('./pages/attendance/AttendanceReports'))


const SalesDashboard = lazy(() => import('./pages/sales/SalesDashboard'))
const SalesContacts = lazy(() => import('./pages/sales/SalesContacts'))
const ContactDetail = lazy(() => import('./pages/sales/ContactDetail'))
const SalesProspects = lazy(() => import('./pages/sales/SalesProspects'))
const BulkLeads = lazy(() => import('./pages/BulkLeads'))
const ProspectDetail = lazy(() => import('./pages/sales/ProspectDetail'))
const SalesPipeline = lazy(() => import('./pages/sales/SalesPipeline'))
const SalesReports = lazy(() => import('./pages/sales/SalesReports'))
const SalesSettings = lazy(() => import('./pages/sales/SalesSettings'))
const CRMPipelinePage = lazy(() => import('./pages/crm/pipeline/page'))
const CRMLeadWorkspacePage = lazy(() => import('./pages/crm/leads/workspace'))
const CRMCompaniesPage = lazy(() => import('./pages/crm/companies/page'))
const CRMCompanyWorkspacePage = lazy(() => import('./pages/crm/companies/workspace'))
const CRMContactsPage = lazy(() => import('./pages/crm/contacts/page'))
const CRMActivitiesPage = lazy(() => import('./pages/crm/activities/page'))
const CRMCalendarPage = lazy(() => import('./pages/crm/calendar/page'))
const CRMReportsPage = lazy(() => import('./pages/crm/reports/page'))
const CRMSettingsPage = lazy(() => import('./pages/crm/settings/page'))
const CRMLeadsPage = lazy(() => import('./pages/crm/leads/page'))

const AdminDashboard = lazy(() => import('./pages/superadmin/AdminDashboard'))
const TenantManagement = lazy(() => import('./pages/superadmin/TenantManagement'))
const TenantDetail = lazy(() => import('./pages/superadmin/TenantDetail'))
const SubscriptionPlans = lazy(() => import('./pages/superadmin/SubscriptionPlans'))
const UsageAnalytics = lazy(() => import('./pages/superadmin/UsageAnalytics'))
const BillingRevenue = lazy(() => import('./pages/superadmin/BillingRevenue'))

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return children
}

const PublicRouteAllowAuth = ({ children }) => children

const LandingRoute = () => {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Landing />
}

const NewLandingRoute = () => {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <NewLanding />
}

const SuperAdminGuard = ({ children }) => {
  const { user } = useAuthStore()
  if (!isSuperAdminRole(user?.role)) return <Navigate to="/dashboard" replace />
  return children
}

const CompanyAdminGuard = ({ children }) => {
  const { user } = useAuthStore()
  if (!hasCompanyAdminAccess(user?.role)) return <Navigate to="/dashboard" replace />
  return children
}

const ModuleGuard = ({ module, children }) => {
  const { user } = useAuthStore()
  if (isSuperAdminRole(user?.role)) return children
  if (user?.modules?.includes(module)) return children
  return <Navigate to="/dashboard" replace />
}

const withBoundary = (component) => (
  <ErrorBoundary>
    {component}
  </ErrorBoundary>
);

function App() {
  useTheme()
  const location = useLocation()
  const setLoading = useUIStore?.getState?.().setLoading

  useEffect(() => {
    applySeoMeta(getSeoMeta(location.pathname))
  }, [location.pathname])

  // Show global loader briefly on route change to indicate navigation
  useEffect(() => {
    if (!setLoading) return
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(t)
  }, [location.pathname, setLoading])

  return (
    <Suspense fallback={<Loader force={true} />}>
      <Routes>
        <Route path="/" element={<NewLandingRoute />} />
        <Route path="/old-landing" element={<LandingRoute />} />
        <Route path="/new-landing" element={<NewLanding />} />
        <Route path="/login" element={<PublicRoute><AuthLayout previewImage="/dashboard-preview.png"><Login /></AuthLayout></PublicRoute>} />
        <Route path="/admin-request" element={<PublicRoute><AuthLayout maxWidth="max-w-5xl"><AdminRequest /></AuthLayout></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><AuthLayout><ForgotPassword /></AuthLayout></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRouteAllowAuth><AuthLayout><ResetPassword /></AuthLayout></PublicRouteAllowAuth>} />
        <Route path="/msa/sign/:token" element={<PublicRouteAllowAuth><MSASign /></PublicRouteAllowAuth>} />

        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="dashboard" element={withBoundary(<Dashboard />)} />
          <Route path="tasks" element={withBoundary(<Tasks />)} />
          <Route path="tickets" element={withBoundary(<Tickets />)} />
          <Route path="chat" element={withBoundary(<Chat />)} />
          <Route path="clients" element={withBoundary(<Clients />)} />
          <Route path="invoices" element={withBoundary(<Invoices />)} />
          <Route path="msa" element={withBoundary(<MSA />)} />
          <Route path="ledger" element={withBoundary(<Ledger />)} />
          <Route path="bulk-leads" element={<CompanyAdminGuard>{withBoundary(<BulkLeads />)}</CompanyAdminGuard>} />
          <Route path="projects" element={withBoundary(<Projects />)} />
          <Route path="projects/:projectId/board" element={withBoundary(<ProjectBoard />)} />
          <Route path="projects/:projectId/tasks/:taskId" element={withBoundary(<TaskDetail />)} />
          <Route path="tasks/:taskId" element={withBoundary(<TaskDetail />)} />
          <Route path="time-tracking" element={withBoundary(<TimeTracking />)} />
          <Route path="meetings" element={withBoundary(<Meetings />)} />
          <Route path="calendar" element={withBoundary(<Calendar />)} />
          <Route path="timesheet" element={withBoundary(<Timesheet />)} />
          <Route path="attendance" element={withBoundary(<Attendance />)} />
          <Route path="live-monitor" element={withBoundary(<LiveMonitor />)} />
          <Route path="attendance-reports" element={withBoundary(<AttendanceReports />)} />

        <Route path="reports" element={withBoundary(<Reports />)} />
        <Route path="notifications" element={withBoundary(<Notifications />)} />
        <Route path="ai-assistant" element={withBoundary(<AIChat />)} />
        <Route path="ai-hub" element={withBoundary(<AIHub />)} />
        <Route path="creative-director" element={withBoundary(<CreativeDirector />)} />
        <Route path="marketing-support" element={withBoundary(<MarketingChat />)} />
        <Route path="marketing/calendar" element={withBoundary(<MarketingCalendar />)} />
        <Route path="ai-prioritization" element={withBoundary(<AIPrioritization />)} />
          <Route path="users" element={withBoundary(<Users />)} />
          <Route path="departments" element={withBoundary(<Departments />)} />
          <Route path="companies" element={withBoundary(<Companies />)} />
          <Route path="subscriptions" element={withBoundary(<Subscriptions />)} />
        <Route path="activity" element={withBoundary(<ActivityLog />)} />
        <Route path="my-team" element={withBoundary(<MyTeam />)} />
        <Route path="settings" element={withBoundary(<Settings />)} />
          <Route path="crm" element={<ProtectedRoute><CRMLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="pipeline" replace />} />
            <Route path="dashboard" element={<Navigate to="/crm/pipeline" replace />} />
            <Route path="pipeline" element={withBoundary(<CRMPipelinePage />)} />
            <Route path="leads" element={withBoundary(<CRMLeadsPage />)} />
            <Route path="leads/:leadId" element={withBoundary(<CRMLeadWorkspacePage />)} />
            <Route path="companies" element={withBoundary(<CRMCompaniesPage />)} />
            <Route path="companies/:companyId" element={withBoundary(<CRMCompanyWorkspacePage />)} />
            <Route path="contacts" element={withBoundary(<CRMContactsPage />)} />
            <Route path="activities" element={withBoundary(<CRMActivitiesPage />)} />
            <Route path="calendar" element={withBoundary(<CRMCalendarPage />)} />
            <Route path="reports" element={withBoundary(<CRMReportsPage />)} />
            <Route path="settings" element={withBoundary(<CRMSettingsPage />)} />
          </Route>
      </Route>

      <Route path="/sales" element={<ProtectedRoute><ModuleGuard module="sales"><SalesLayout /></ModuleGuard></ProtectedRoute>}>
          <Route index element={withBoundary(<SalesDashboard />)} />
          <Route path="contacts" element={withBoundary(<SalesContacts />)} />
          <Route path="contacts/:id" element={withBoundary(<ContactDetail />)} />
          <Route path="prospects" element={withBoundary(<SalesProspects />)} />
          <Route path="prospects/:id" element={withBoundary(<ProspectDetail />)} />
          <Route path="pipeline" element={withBoundary(<SalesPipeline />)} />
          <Route path="reports" element={withBoundary(<SalesReports />)} />
          <Route path="settings" element={withBoundary(<SalesSettings />)} />
        </Route>

        <Route path="/super-admin" element={<ProtectedRoute><SuperAdminGuard><SuperAdminLayout /></SuperAdminGuard></ProtectedRoute>}>
          <Route index element={withBoundary(<AdminDashboard />)} />
          <Route path="dashboard" element={withBoundary(<AdminDashboard />)} />
          <Route path="tenants" element={withBoundary(<TenantManagement />)} />
          <Route path="tenants/:id" element={withBoundary(<TenantDetail />)} />
          <Route path="plans" element={withBoundary(<SubscriptionPlans />)} />
          <Route path="usage" element={withBoundary(<UsageAnalytics />)} />
          <Route path="billing" element={withBoundary(<BillingRevenue />)} />
          <Route path="companies" element={withBoundary(<Companies />)} />
          <Route path="users" element={withBoundary(<Users />)} />
          <Route path="activity" element={withBoundary(<ActivityLog />)} />
          <Route path="settings" element={withBoundary(<Settings />)} />
        </Route>

        <Route path="/*" element={<NotFound />} />
      </Routes>
      <ConfirmDialog />
      <UndoBar />
      {import.meta.env.DEV && <Agentation />}
    </Suspense>
  )
}

export default App
