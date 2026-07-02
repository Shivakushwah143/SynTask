import { TopNavigation } from './layout/TopNavigation'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useUIStore } from '../store/uiStore'

const Header = ({ title, subtitle, onMenuClick, onSearchOpen, onCommandOpen, onLogout }) => {
  const { logout, isLoggingOut } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    if (isLoggingOut) return
    await logout()
    toast.success('Logged out successfully')
    navigate('/login', { replace: true })
  }

  return (
    <TopNavigation
      title={title}
      subtitle={subtitle}
      onMenuClick={onMenuClick}
      onSearchOpen={onSearchOpen}
      onCommandOpen={onCommandOpen}
      onLogout={onLogout || handleLogout}
      logoutLoading={isLoggingOut}
    />
  )
}

export default Header