import { TopNavigation } from './layout/TopNavigation'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const Header = ({ title, subtitle, onMenuClick, onSearchOpen, onCommandOpen, onLogout }) => {
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <TopNavigation
      title={title}
      subtitle={subtitle}
      onMenuClick={onMenuClick}
      onSearchOpen={onSearchOpen}
      onCommandOpen={onCommandOpen}
      onLogout={onLogout || handleLogout}
    />
  )
}

export default Header
