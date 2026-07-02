import { TopNavigation } from './layout/TopNavigation'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useUIStore } from '../store/uiStore'

const Header = ({ title, subtitle, onMenuClick, onSearchOpen, onCommandOpen, onLogout }) => {
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    ;(async () => {
      useUIStore.getState().setLoading(true)
      try {
        await logout()
      } finally {
        useUIStore.getState().setLoading(false)
        toast.success('Logged out successfully')
        navigate('/login')
      }
    })()
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
