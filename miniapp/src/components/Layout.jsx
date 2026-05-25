import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Inbox, 
  Package, 
  BarChart3, 
  Settings,
  Store
} from 'lucide-react'
import '../styles/Layout.css'

function Layout({ children, user }) {
  const location = useLocation()

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/inbox', icon: Inbox, label: 'Inbox' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/settings', icon: Settings, label: 'Settings' }
  ]

  return (
    <div className="layout">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <Store size={24} />
            <span>MiniMe</span>
          </div>
          {user && (
            <div className="user-info">
              <span>{user.first_name}</span>
              <img 
                src={user.photo_url || '/default-avatar.png'} 
                alt="Profile" 
                className="avatar"
              />
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {children}
      </main>

      <nav className="bottom-nav">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link 
              key={item.path} 
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default Layout