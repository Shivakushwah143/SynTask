import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Layouts
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Pages
import Login from './pages/auth/Login'
import AdminRequest from './pages/auth/AdminRequest'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import Users from './pages/Users'
import Companies from './pages/Companies'
import Subscriptions from './pages/Subscriptions'
import ActivityLog from './pages/ActivityLog'
import Settings from './pages/Settings'
import MyTeam from './pages/MyTeam'
import NotFound from './pages/NotFound'
import Projects from './pages/Projects'
import ProjectBoard from './pages/ProjectBoard'
import TaskDetail from './pages/TaskDetail'
import TimeTracking from './pages/TimeTracking'
import Tickets from './pages/Tickets'
import Chat from './pages/Chat'
import Clients from './pages/Clients'
import Invoices from './pages/Invoices'
import MSA from './pages/MSA'
import MSASign from './pages/MSASign'
import Ledger from './pages/Ledger'

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return children
}

// Public Route Component (redirect to dashboard if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }
  
  return children
}

// Public Route that allows access even when authenticated (for password reset)
const PublicRouteAllowAuth = ({ children }) => {
  return children
}

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/admin-request"
        element={
          <PublicRoute>
            <AuthLayout maxWidth="max-w-5xl">
              <AdminRequest />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <AuthLayout>
              <ForgotPassword />
            </AuthLayout>
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRouteAllowAuth>
            <AuthLayout>
              <ResetPassword />
            </AuthLayout>
          </PublicRouteAllowAuth>
        }
      />
      <Route
        path="/msa/sign/:token"
        element={
          <PublicRouteAllowAuth>
            <MSASign />
          </PublicRouteAllowAuth>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
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
        <Route path="users" element={<Users />} />
        <Route path="companies" element={<Companies />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="my-team" element={<MyTeam />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* 404 Not Found */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
