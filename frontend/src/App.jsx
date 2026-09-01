import DemoLayout from './layouts/DemoLayout';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useEffect } from 'react';
import Loader from './components/Loader';
import { useUIStore } from './store/uiStore';
import { useAuthStore } from './store/authStore';
import { useTheme } from './hooks/useTheme';
import { ErrorBoundary } from './components/ErrorBoundary';
import ConfirmDialog from './components/ConfirmDialog';
import UndoBar from './components/UndoBar';
import { Agentation } from "agentation";
import { hasCompanyAdminAccess, isManagerRole, isSuperAdminRole } from './utils/roles';
import { hasModuleAccess } from './utils/rbac';
import { applySeoMeta, getSeoMeta } from './utils/seo';
import DemoHome from './pages/DemoHome';

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
const AdminPermissions = lazy(() => import('./pages/AdminPermissions'))
const AIPrioritization = lazy(() => import('./pages/AIPrioritization'))
const Companies = lazy(() => import('./pages/Companies'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const ActivityLog = lazy(() => import('./pages/ActivityLog'))
const Timeline = lazy(() => import('./pages/Timeline'))
const Leaves = lazy(() => import('./pages/Leaves'))
const EODReports = lazy(() => import('./pages/EODReports'))
const Settings = lazy(() => import('./pages/Settings'))
const MyTeam = lazy(() => import('./pages/MyTeam'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Projects = lazy(() => import('./pages/Projects'))
const ProjectBoard = lazy(() => import('./pages/ProjectBoard'))
const TaskDetail = lazy(() => import('./pages/TaskDetail'))
const WorkflowAdmin = lazy(() => import('./pages/WorkflowAdmin'))
const TimeTracking = lazy(() => import('./pages/TimeTracking'))
const Tickets = lazy(() => import('./pages/Tickets'))
const Chat = lazy(() => import('./pages/Chat'))
const Clients = lazy(() => import('./pages/Clients'))
const ClientWorkspacePage = lazy(() => import('./pages/ClientWorkspace'))
const Invoices = lazy(() => import('./pages/Invoices'))
// MSA hidden by request. Keep implementation available for later restore.
// const MSA = lazy(() => import('./pages/MSA'))
// const MSASign = lazy(() => import('./pages/MSASign'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Meetings = lazy(() => import('./pages/Meetings'))
const WorkspaceCalendar = lazy(() => import('./pages/WorkspaceCalendar'))
const ContentCalendar = lazy(() => import('./pages/ContentCalendar'))
const Timesheet = lazy(() => import('./pages/Timesheet'))
const Reports = lazy(() => import('./pages/Reports'))
const AIChat = lazy(() => import('./pages/AIChat'))
const AIHub = lazy(() => import('./pages/AIHub'))
const CreativeDirector = lazy(() => import('./pages/CreativeDirector'))
const MarketingChat = lazy(() => import('./pages/MarketingChat'))
const MarketingCalendar = lazy(() => import('./pages/marketing/calendar/page'))
const Notifications = lazy(() => import('./pages/Notifications'))
const ScheduledJobs = lazy(() => import('./pages/ScheduledJobs'))
const Attendance = lazy(() => import('./pages/attendance/Attendance'))
const LiveMonitor = lazy(() => import('./pages/attendance/LiveMonitor'))
const AttendanceReports = lazy(() => import('./pages/attendance/AttendanceReports'))
const AttendancePolicySettings = lazy(() => import('./pages/attendance/AttendancePolicySettings'))
const HolidaysPage = lazy(() => import('./pages/attendance/HolidaysPage'))
const CorrectionsPage = lazy(() => import('./pages/attendance/CorrectionsPage'))
const SalaryComponentsPage = lazy(() => import('./pages/attendance/SalaryComponentsPage'))
const PayrollPeriods = lazy(() => import('./pages/payroll/PayrollPeriods'))
const PayrollPeriodDetail = lazy(() => import('./pages/payroll/PayrollPeriodDetail'))
const PayrollRecordDetail = lazy(() => import('./pages/payroll/PayrollRecordDetail'))
const SalaryStructuresPage = lazy(() => import('./pages/payroll/SalaryStructuresPage'))
const GoogleWorkspace = lazy(() => import('./pages/GoogleWorkspace'))
const SectionLanding = lazy(() => import('./pages/SectionLanding'))
const SOPLibrary = lazy(() => import('./pages/SOPLibrary'))


const SalesDashboard = lazy(() => import('./pages/sales/SalesDashboard'))
const SalesContacts = lazy(() => import('./pages/sales/SalesContacts'))
const ContactDetail = lazy(() => import('./pages/sales/ContactDetail'))
const BulkLeads = lazy(() => import('./pages/BulkLeads'))
const SalesReports = lazy(() => import('./pages/sales/SalesReports'))
const SalesSettings = lazy(() => import('./pages/sales/SalesSettings'))
const CRMPipelinePage = lazy(() => import('./pages/crm/pipeline/page'))
const CRMLeadWorkspacePage = lazy(() => import('./pages/crm/leads/workspace'))
const CRMCompaniesPage = lazy(() => import('./pages/crm/companies/page'))
const CRMCompanyWorkspacePage = lazy(() => import('./pages/crm/companies/workspace'))
const CRMContactsPage = lazy(() => import('./pages/crm/contacts/page'))
const CRMActivitiesPage = lazy(() => import('./pages/crm/activities/page'))
const CRMMetaInboxPage = lazy(() => import('./pages/crm/inbox/MetaInbox'))
const CRMCalendarPage = lazy(() => import('./pages/crm/calendar/page'))
const CRMReportsPage = lazy(() => import('./pages/crm/reports/page'))
const CRMSettingsPage = lazy(() => import('./pages/crm/settings/page'))
const CRMMetaIntegrationPage = lazy(() => import('./pages/crm/settings/meta'))
const CRMLeadsPage = lazy(() => import('./pages/crm/leads/page'))
const CRMAllLeadsPage = lazy(() => import('./pages/crm/leads/all'))
const SalesOverviewPage = lazy(() => import('./pages/sales/SalesOverview'))
const PublicCrmDocument = lazy(() => import('./pages/crm/PublicCrmDocument'))
const HRDepartment = lazy(() => import('./pages/hr/HRDepartment'))
const HRDashboard = lazy(() => import('./pages/hr/HRDashboard'))
const HRReports = lazy(() => import('./pages/hr/HRReports'))
const MyHRLayout = lazy(() => import('./pages/hr/me/MyHRLayout'))
const MyHROverview = lazy(() => import('./pages/hr/me/MyHROverview'))
const MyProfile = lazy(() => import('./pages/hr/me/MyProfile'))
const MyAttendance = lazy(() => import('./pages/hr/me/MyAttendance'))
const MyLeave = lazy(() => import('./pages/hr/me/MyLeave'))
const MyDocuments = lazy(() => import('./pages/hr/me/MyDocuments'))
const MyPayslips = lazy(() => import('./pages/hr/me/MyPayslips'))
const RecruitmentDashboard = lazy(() => import('./pages/hr/recruitment/RecruitmentDashboard'))
const CandidateInterviewScreen = lazy(() => import('./pages/hr/recruitment/CandidateInterviewScreen'))
const RecruitmentJobsPage = lazy(() => import('./modules/hr/recruitment/pages/JobsPage'))
const RecruitmentJobDetailPage = lazy(() => import('./modules/hr/recruitment/pages/JobDetailPage'))
const RecruitmentInboxPage = lazy(() => import('./modules/hr/recruitment/pages/InboxPage'))
const RecruitmentCandidatesPage = lazy(() => import('./modules/hr/recruitment/pages/CandidatesPage'))
const RecruitmentResumePoolPage = lazy(() => import('./modules/hr/recruitment/pages/ResumePoolPage'))
const RecruitmentEmployeesPage = lazy(() => import('./modules/hr/recruitment/pages/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('./modules/hr/recruitment/pages/EmployeeDetailPage'))
const HRDocumentsPage = lazy(() => import('./pages/hr/HRDocumentsPage'))
const RecruitmentInterviewsPage = lazy(() => import('./modules/hr/recruitment/pages/InterviewsPage'))
const RecruitmentOffersPage = lazy(() => import('./modules/hr/recruitment/pages/OffersPage'))
const RecruitmentReportsPage = lazy(() => import('./modules/hr/recruitment/pages/ReportsPage'))
const CandidateOfferPage = lazy(() => import('./modules/hr/recruitment/pages/CandidateOfferPage'))
const DocumentTypesSettingsPage = lazy(() => import('./modules/hr/recruitment/pages/DocumentTypesSettingsPage'))
const LeaveTypesSettingsPage = lazy(() => import('./modules/hr/recruitment/pages/LeaveTypesSettingsPage'))
const LeaveAllocationsPage = lazy(() => import('./modules/hr/recruitment/pages/LeaveAllocationsPage'))
const CareersLandingPage = lazy(() => import('./modules/hr/recruitment/pages/CareerPortalPage').then((module) => ({ default: module.CareersLandingPage })))
const CareerJobDetailsPage = lazy(() => import('./modules/hr/recruitment/pages/CareerPortalPage').then((module) => ({ default: module.CareerJobDetailsPage })))
const CareerTrackingPage = lazy(() => import('./modules/hr/recruitment/pages/CareerPortalPage').then((module) => ({ default: module.CareerTrackingPage })))

const AdminDashboard = lazy(() => import('./pages/superadmin/AdminDashboard'))
const TenantManagement = lazy(() => import('./pages/superadmin/TenantManagement'))
const TenantDetail = lazy(() => import('./pages/superadmin/TenantDetail'))
const SubscriptionPlans = lazy(() => import('./pages/superadmin/SubscriptionPlans'))
const UsageAnalytics = lazy(() => import('./pages/superadmin/UsageAnalytics'))
const BillingRevenue = lazy(() => import('./pages/superadmin/BillingRevenue'))
const FeatureFlagsPage = lazy(() => import('./pages/superadmin/FeatureFlagsPage'))

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

// Only admins and managers can access CRM settings
const CRMSettingsGuard = ({ children }) => {
  const { user } = useAuthStore()
  if (hasCompanyAdminAccess(user?.role) || isManagerRole(user?.role)) return children
  return <Navigate to="/crm/leads" replace />
}

// Route-level module gate — SAME permission check as the backend's require_module
// (utils/rbac.js hasModuleAccess): admins/sub-admins/super-admins pass everything,
// Manager/Lead/Employee are auto-granted sales_crm/tickets/recruitment, otherwise the
// user's module list is consulted. This keeps the UI gate aligned with API auth.
const ModuleGuard = ({ module, children }) => {
  const { user } = useAuthStore()
  if (hasModuleAccess(user?.role, user?.modules, module)) return children
  return <Navigate to="/dashboard" replace />
}

const LegacySalesLeadRedirect = () => {
  const { id } = useParams()
  return <Navigate to={`/crm/leads/${id}`} replace />
}

// Legacy HR routes → canonical HR routes (People → Employees is /hr/employees).
const LegacyEmployeeDetailRedirect = () => {
  const { employeeId } = useParams()
  return <Navigate to={`/hr/employees/${employeeId}`} replace />
}

const DashboardRoute = () => {
  const { user } = useAuthStore()
  if (isSuperAdminRole(user?.role)) return <Navigate to="/super-admin/dashboard" replace />
  return withStandaloneBoundary(<Dashboard />)
}

const withStandaloneBoundary = (element) => <ErrorBoundary>{element}</ErrorBoundary>

function App() {
  useTheme()
  const location = useLocation()
  const withBoundary = (element) => <ErrorBoundary key={location.pathname}>{element}</ErrorBoundary>
  const setLoading = useUIStore?.getState?.().setLoading

  useEffect(() => {
    useAuthStore.getState().initializeAuth()
  }, [])

  useEffect(() => {
    applySeoMeta(getSeoMeta(location.pathname))
  }, [location.pathname])

  // ── Live permission sync ────────────────────────────────────────────────────
  // Poll /auth/me every 60 s so module/role changes made by an admin are
  // reflected in the employee's UI without requiring a logout/login cycle.
  useEffect(() => {
    const { refreshUser, isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) return

    // Immediate refresh on mount
    void refreshUser()

    // Poll every 60 seconds
    const interval = setInterval(() => {
      if (useAuthStore.getState().isAuthenticated) {
        void useAuthStore.getState().refreshUser()
      }
    }, 60_000)

    // Also refresh when the tab becomes visible again (e.g. user switches back)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && useAuthStore.getState().isAuthenticated) {
        void useAuthStore.getState().refreshUser()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

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
        <Route path="/demo/*" element={<DemoLayout />}>
          <Route index element={<DemoHome />} />
        </Route>
        <Route path="/login" element={<PublicRoute><AuthLayout previewImage="/dashboard-preview.png"><Login /></AuthLayout></PublicRoute>} />
        <Route path="/admin-request" element={<PublicRoute><AuthLayout maxWidth="max-w-5xl"><AdminRequest /></AuthLayout></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><AuthLayout><ForgotPassword /></AuthLayout></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRouteAllowAuth><AuthLayout><ResetPassword /></AuthLayout></PublicRouteAllowAuth>} />
        {/* MSA hidden by request. Keep route commented for later restore.
        <Route path="/msa/sign/:token" element={<PublicRouteAllowAuth><MSASign /></PublicRouteAllowAuth>} />
        */}
        <Route path="/careers" element={withBoundary(<CareersLandingPage />)} />
        <Route path="/careers/:companySlug" element={withBoundary(<CareersLandingPage />)} />
        <Route path="/careers/:companySlug/jobs/:slug" element={withBoundary(<CareerJobDetailsPage />)} />
        <Route path="/careers/jobs/:slug" element={withBoundary(<CareerJobDetailsPage />)} />
        <Route path="/careers/track" element={withBoundary(<CareerTrackingPage />)} />
        <Route path="/public/offers/:token" element={withBoundary(<CandidateOfferPage />)} />
        <Route path="/public/crm-documents/:token" element={withBoundary(<PublicCrmDocument />)} />

        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="dashboard" element={<DashboardRoute />} />
          <Route path="workflow" element={<Navigate to="/crm/pipeline" replace />} />
          <Route path="leads" element={<Navigate to="/crm/leads" replace />} />
          <Route path="tasks" element={<ModuleGuard module="tasks">{withBoundary(<Tasks />)}</ModuleGuard>} />
          <Route path="tickets" element={withBoundary(<Tickets />)} />
          <Route path="chat" element={withBoundary(<Chat />)} />
          <Route path="clients" element={<ModuleGuard module="clients">{withBoundary(<Clients />)}</ModuleGuard>} />
          <Route path="clients/:clientId/workspace" element={<ModuleGuard module="clients">{withBoundary(<ClientWorkspacePage />)}</ModuleGuard>} />
          <Route path="invoices" element={<ModuleGuard module="invoices">{withBoundary(<Invoices />)}</ModuleGuard>} />
          {/* MSA hidden by request. Keep route commented for later restore.
          <Route path="msa" element={withBoundary(<MSA />)} />
          */}
          <Route path="ledger" element={<ModuleGuard module="transactions">{withBoundary(<Ledger />)}</ModuleGuard>} />
          <Route path="bulk-leads" element={<ModuleGuard module="import_leads">{withBoundary(<BulkLeads />)}</ModuleGuard>} />
          <Route path="projects" element={<ModuleGuard module="projects">{withBoundary(<Projects />)}</ModuleGuard>} />
          <Route path="projects/:projectId/board" element={<ModuleGuard module="projects">{withBoundary(<ProjectBoard />)}</ModuleGuard>} />
          <Route path="projects/:projectId/tasks/:taskId" element={<ModuleGuard module="tasks">{withBoundary(<TaskDetail />)}</ModuleGuard>} />
          <Route path="tasks/:taskId" element={<ModuleGuard module="tasks">{withBoundary(<TaskDetail />)}</ModuleGuard>} />
          <Route path="workflows" element={<CompanyAdminGuard><ModuleGuard module="automation_rules">{withBoundary(<WorkflowAdmin />)}</ModuleGuard></CompanyAdminGuard>} />
          <Route path="time-tracking" element={withBoundary(<TimeTracking />)} />
          <Route path="meetings" element={withBoundary(<Meetings />)} />
          <Route path="calendar" element={withBoundary(<WorkspaceCalendar />)} />
          <Route path="google-workspace" element={withBoundary(<GoogleWorkspace />)} />
          <Route path="content-calendar" element={<ModuleGuard module="content_calendar">{withBoundary(<ContentCalendar />)}</ModuleGuard>} />
          <Route path="content-calendar/items" element={<Navigate to="/content-calendar" replace />} />
          <Route path="timesheet" element={<ModuleGuard module="time_tracking">{withBoundary(<Timesheet />)}</ModuleGuard>} />
          <Route path="attendance" element={<ModuleGuard module="attendance">{withBoundary(<Attendance />)}</ModuleGuard>} />
          <Route path="attendance/live" element={<Navigate to="/live-monitor" replace />} />
          <Route path="attendance/reports" element={<Navigate to="/attendance-reports" replace />} />
          <Route path="attendance/corrections" element={withBoundary(<CorrectionsPage />)} />

          <Route path="live-monitor" element={<ModuleGuard module="live_attendance">{withBoundary(<LiveMonitor />)}</ModuleGuard>} />
          <Route path="attendance-reports" element={<ModuleGuard module="attendance_reports">{withBoundary(<AttendanceReports />)}</ModuleGuard>} />

        <Route path="reports" element={withBoundary(<Reports />)} />
        <Route path="notifications" element={withBoundary(<Notifications />)} />
        <Route path="scheduled-jobs" element={<ModuleGuard module="scheduled_work">{withBoundary(<ScheduledJobs />)}</ModuleGuard>} />
        <Route path="ai-assistant" element={withBoundary(<AIChat />)} />
        <Route path="ai-hub" element={<ModuleGuard module="ai_assistant">{withBoundary(<AIHub />)}</ModuleGuard>} />
        <Route path="creative-director" element={<ModuleGuard module="ai_content_assistant">{withBoundary(<CreativeDirector />)}</ModuleGuard>} />
        <Route path="marketing-support" element={<ModuleGuard module="ai_content_assistant">{withBoundary(<MarketingChat />)}</ModuleGuard>} />
        <Route path="marketing/calendar" element={withBoundary(<MarketingCalendar />)} />
        <Route path="ai-prioritization" element={withBoundary(<AIPrioritization />)} />
          <Route path="users" element={withBoundary(<Users />)} />
          <Route path="departments" element={withBoundary(<Departments />)} />
          <Route path="admin-permissions" element={<CompanyAdminGuard>{withBoundary(<AdminPermissions />)}</CompanyAdminGuard>} />
          <Route path="companies" element={withBoundary(<Companies />)} />
          <Route path="subscriptions" element={withBoundary(<Subscriptions />)} />
        <Route path="activity" element={<ModuleGuard module="activity_logs">{withBoundary(<ActivityLog />)}</ModuleGuard>} />
        <Route path="timeline" element={withBoundary(<Timeline />)} />
        <Route path="leaves" element={<ModuleGuard module="leave_management">{withBoundary(<Leaves />)}</ModuleGuard>} />
        <Route path="eod" element={<ModuleGuard module="daily_updates">{withBoundary(<EODReports />)}</ModuleGuard>} />
        <Route path="my-team" element={withBoundary(<MyTeam />)} />
        <Route path="settings" element={withBoundary(<Settings />)} />
        <Route path="sop-library" element={withBoundary(<SOPLibrary />)} />
        <Route path="sop-library/:moduleKey" element={withBoundary(<SOPLibrary />)} />
        <Route path="sop-library/:moduleKey/:articleKey" element={withBoundary(<SOPLibrary />)} />
        <Route path="sections/:sectionKey" element={withBoundary(<SectionLanding />)} />
        {/* Sales workspace Overview — the first tab of the guided sales journey. */}
        <Route path="sales-overview" element={<ModuleGuard module="sales_overview">{withBoundary(<SalesOverviewPage />)}</ModuleGuard>} />
          <Route path="hr">
            <Route index element={<Navigate to="/hr/dashboard" replace />} />
            <Route path="dashboard" element={withBoundary(<HRDashboard />)} />
            <Route path="reports" element={withBoundary(<HRReports />)} />
            <Route path="reports/:category/:report" element={withBoundary(<HRReports />)} />
            {/* Phase 8 — Employee Self-Service (My HR): available to every
                authenticated company employee (role-independent). The layout
                guards for a linked Employee Profile. */}
            <Route path="me" element={withBoundary(<MyHRLayout />)}>
              <Route index element={withBoundary(<MyHROverview />)} />
              <Route path="profile" element={withBoundary(<MyProfile />)} />
              <Route path="attendance" element={withBoundary(<MyAttendance />)} />
              <Route path="leave" element={withBoundary(<MyLeave />)} />
              <Route path="documents" element={withBoundary(<MyDocuments />)} />
              <Route path="payslips" element={withBoundary(<MyPayslips />)} />
            </Route>
            {/* Canonical HR-wide routes: Employee Profiles and HR Documents are
                People/HR features, not Recruitment features. */}
            <Route path="employees" element={withBoundary(<RecruitmentEmployeesPage />)} />
            <Route path="employees/:employeeId" element={withBoundary(<EmployeeDetailPage />)} />
            <Route path="documents" element={withBoundary(<HRDocumentsPage />)} />
            <Route path="settings/document-types" element={withBoundary(<DocumentTypesSettingsPage />)} />
            <Route path="settings/leave-types" element={withBoundary(<LeaveTypesSettingsPage />)} />
            <Route path="settings/attendance-policy" element={withBoundary(<AttendancePolicySettings />)} />
            <Route path="settings/holidays" element={withBoundary(<HolidaysPage />)} />
            <Route path="settings/salary-components" element={<Navigate to="/hr/payroll/salary-components" replace />} />
            <Route path="settings/salary-structures" element={<Navigate to="/hr/payroll/salary-structures" replace />} />
            <Route path="leave-allocations" element={withBoundary(<LeaveAllocationsPage />)} />
            <Route path="payroll" element={withBoundary(<PayrollPeriods />)} />
            <Route path="payroll/salary-components" element={withBoundary(<SalaryComponentsPage />)} />
            <Route path="payroll/salary-structures" element={withBoundary(<SalaryStructuresPage />)} />
            <Route path="payroll/:periodId" element={withBoundary(<PayrollPeriodDetail />)} />
            <Route path="payroll/:periodId/records/:recordId" element={withBoundary(<PayrollRecordDetail />)} />
            <Route path="recruitment">
              <Route index element={withBoundary(<RecruitmentDashboard />)} />
              <Route path="jobs" element={withBoundary(<RecruitmentJobsPage />)} />
              <Route path="jobs/:jobId" element={withBoundary(<RecruitmentJobDetailPage />)} />
              <Route path="inbox" element={withBoundary(<RecruitmentInboxPage />)} />
              <Route path="candidates" element={withBoundary(<RecruitmentCandidatesPage />)} />
              <Route path="candidates/:candidateId" element={withBoundary(<RecruitmentCandidatesPage />)} />
              <Route path="resume-pool" element={withBoundary(<RecruitmentResumePoolPage />)} />
              <Route path="interviews" element={withBoundary(<RecruitmentInterviewsPage />)} />
              <Route path="offers" element={withBoundary(<RecruitmentOffersPage />)} />
              <Route path="reports" element={withBoundary(<RecruitmentReportsPage />)} />
              <Route path="interview-screen" element={withBoundary(<CandidateInterviewScreen />)} />
              {/* Legacy aliases → canonical HR routes (backward compatible). */}
              <Route path="employees" element={<Navigate to="/hr/employees" replace />} />
              <Route path="employees/:employeeId" element={<LegacyEmployeeDetailRedirect />} />
              <Route path="settings/document-types" element={<Navigate to="/hr/settings/document-types" replace />} />
            </Route>
          </Route>
          <Route path="crm" element={<ProtectedRoute><CRMLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="pipeline" replace />} />
            <Route path="dashboard" element={<Navigate to="/crm/pipeline" replace />} />
            <Route path="pipeline" element={<ModuleGuard module="sales_pipeline">{withBoundary(<CRMPipelinePage />)}</ModuleGuard>} />
            <Route path="pipeline/:stageKey" element={<ModuleGuard module="sales_pipeline">{withBoundary(<CRMPipelinePage />)}</ModuleGuard>} />
            <Route path="leads" element={<ModuleGuard module="leads">{withBoundary(<CRMLeadsPage />)}</ModuleGuard>} />
            <Route path="leads/all" element={<ModuleGuard module="leads">{withBoundary(<CRMAllLeadsPage />)}</ModuleGuard>} />
            <Route path="leads/:leadId" element={<ModuleGuard module="leads">{withBoundary(<CRMLeadWorkspacePage />)}</ModuleGuard>} />
            <Route path="companies" element={<ModuleGuard module="companies">{withBoundary(<CRMCompaniesPage />)}</ModuleGuard>} />
            <Route path="companies/:companyId" element={<ModuleGuard module="companies">{withBoundary(<CRMCompanyWorkspacePage />)}</ModuleGuard>} />
            <Route path="contacts" element={<ModuleGuard module="contacts">{withBoundary(<CRMContactsPage />)}</ModuleGuard>} />
            <Route path="inbox" element={<ModuleGuard module="meta_messages">{withBoundary(<CRMMetaInboxPage />)}</ModuleGuard>} />
            <Route path="activities" element={withBoundary(<CRMActivitiesPage />)} />
            <Route path="calendar" element={<ModuleGuard module="client_calendar">{withBoundary(<CRMCalendarPage />)}</ModuleGuard>} />
            <Route path="reports" element={<ModuleGuard module="client_insights">{withBoundary(<CRMReportsPage />)}</ModuleGuard>} />
            <Route path="configuration" element={<Navigate to="/crm/settings" replace />} />
            <Route path="settings/meta" element={<CRMSettingsGuard><ModuleGuard module="meta_settings">{withBoundary(<CRMMetaIntegrationPage />)}</ModuleGuard></CRMSettingsGuard>} />
            <Route path="settings" element={<CRMSettingsGuard><ModuleGuard module="meta_settings">{withBoundary(<CRMSettingsPage />)}</ModuleGuard></CRMSettingsGuard>} />
          </Route>
      </Route>

      <Route path="/sales" element={<ProtectedRoute><ModuleGuard module="sales"><SalesLayout /></ModuleGuard></ProtectedRoute>}>
          <Route index element={withBoundary(<SalesDashboard />)} />
          <Route path="contacts" element={withBoundary(<SalesContacts />)} />
          <Route path="contacts/:id" element={withBoundary(<ContactDetail />)} />
          <Route path="prospects" element={<Navigate to="/crm/leads" replace />} />
          <Route path="prospects/:id" element={<LegacySalesLeadRedirect />} />
          <Route path="queue" element={<Navigate to="/crm/pipeline" replace />} />
          <Route path="pipeline" element={<Navigate to="/crm/pipeline" replace />} />
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
          <Route path="feature-flags" element={withBoundary(<FeatureFlagsPage />)} />
          <Route path="companies" element={withBoundary(<Companies />)} />
          <Route path="clients" element={withBoundary(<Clients />)} />
          <Route path="users" element={withBoundary(<Users />)} />
          <Route path="activity" element={withBoundary(<ActivityLog />)} />
          <Route path="settings" element={withBoundary(<Settings />)} />
        </Route>

        <Route path="/*" element={<NotFound />} />
      </Routes>
      <ConfirmDialog />
      <UndoBar />
      {import.meta.env.DEV && import.meta.env.VITE_ENABLE_AGENTATION === 'true' && <Agentation />}
    </Suspense>
  )
}


export default App
