import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { PageLoader } from './components/ui'

const MainLayout = lazy(() => import('./layouts/MainLayout'))
const AuthLayout = lazy(() => import('./layouts/AuthLayout'))
const SalesLayout = lazy(() => import('./layouts/SalesLayout'))
const SuperAdminLayout = lazy(() => import('./layouts/SuperAdminLayout'))

const Login = lazy(() => import('./pages/auth/Login'))
const AdminRequest = lazy(() => import('./pages/auth/AdminRequest'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Users = lazy(() => import('./pages/Users'))
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

const SalesDashboard = lazy(() => import('./pages/sales/SalesDashboard'))
const SalesContacts = lazy(() => import('./pages/sales/SalesContacts'))
const ContactDetail = lazy(() => import('./pages/sales/ContactDetail'))
const SalesProspects = lazy(() => import('./pages/sales/SalesProspects'))
const ProspectDetail = lazy(() => import('./pages/sales/ProspectDetail'))
const SalesPipeline = lazy(() => import('./pages/sales/SalesPipeline'))
const SalesReports = lazy(() => import('./pages/sales/SalesReports'))
const SalesSettings = lazy(() => import('./pages/sales/SalesSettings'))

const AdminDashboard = lazy(() => import('./pages/superadmin/AdminDashboard'))
const TenantManagement = lazy(() => import('./pages/superadmin/TenantManagement'))
const TenantDetail = lazy(() => import('./pages/superadmin/TenantDetail'))
const SubscriptionPlans = lazy(() => import('./pages/superadmin/SubscriptionPlans'))
const UsageAnalytics = lazy(() => import('./pages/superadmin/UsageAnalytics'))
const BillingRevenue = lazy(() => import('./pages/superadmin/BillingRevenue'))

const isSuperAdminRole = (role) => ['super_admin', 'SuperAdmin'].includes(role)

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

const SuperAdminGuard = ({ children }) => {
  const { user } = useAuthStore()
  if (!isSuperAdminRole(user?.role)) return <Navigate to="/dashboard" replace />
  return children
}

const ModuleGuard = ({ module, children }) => {
  const { user } = useAuthStore()
  if (isSuperAdminRole(user?.role)) return children
  if (user?.modules?.includes(module)) return children
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicRoute><AuthLayout><Login /></AuthLayout></PublicRoute>} />
        <Route path="/admin-request" element={<PublicRoute><AuthLayout maxWidth="max-w-5xl"><AdminRequest /></AuthLayout></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><AuthLayout><ForgotPassword /></AuthLayout></PublicRoute>} />
        <Route path="/reset-password" element={<PublicRouteAllowAuth><AuthLayout><ResetPassword /></AuthLayout></PublicRouteAllowAuth>} />
        <Route path="/msa/sign/:token" element={<PublicRouteAllowAuth><MSASign /></PublicRouteAllowAuth>} />

        <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="chat" element={<Chat />} />
          <Route path="clients" element={<Clients />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="msa" element={<MSA />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId/board" element={<ProjectBoard />} />
          <Route path="projects/:projectId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="tasks/:taskId" element={<TaskDetail />} />
          <Route path="time-tracking" element={<TimeTracking />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="timesheet" element={<Timesheet />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="companies" element={<Companies />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="my-team" element={<MyTeam />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/sales" element={<ProtectedRoute><ModuleGuard module="sales"><SalesLayout /></ModuleGuard></ProtectedRoute>}>
          <Route index element={<SalesDashboard />} />
          <Route path="contacts" element={<SalesContacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="prospects" element={<SalesProspects />} />
          <Route path="prospects/:id" element={<ProspectDetail />} />
          <Route path="pipeline" element={<SalesPipeline />} />
          <Route path="reports" element={<SalesReports />} />
          <Route path="settings" element={<SalesSettings />} />
        </Route>

        <Route path="/super-admin" element={<ProtectedRoute><SuperAdminGuard><SuperAdminLayout /></SuperAdminGuard></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="tenants" element={<TenantManagement />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="plans" element={<SubscriptionPlans />} />
          <Route path="usage" element={<UsageAnalytics />} />
          <Route path="billing" element={<BillingRevenue />} />
          <Route path="companies" element={<Companies />} />
          <Route path="users" element={<Users />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default App
