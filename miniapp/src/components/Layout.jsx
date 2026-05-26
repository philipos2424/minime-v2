import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Inbox, Package, BarChart3, Settings } from 'lucide-react'
import { MiniMeLogo } from './MiniMeLogo'

const COLORS = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', cream: '#F4EEE1', paper: '#FBF8F1',
  gold: '#B08A4A', goldSoft: '#D4B987'
}
const SERIF = "'Georgia', 'Newsreader', serif"
const BODY = "'Geist', 'Inter', system-ui, sans-serif"

function Layout({ children, user }) {
  const location = useLocation()
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Home' },
    { path: '/inbox', icon: Inbox, label: 'Inbox' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/analytics', icon: BarChart3, label: 'Stats' },
    { path: '/settings', icon: Settings, label: 'Settings' }
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.paper,
      color: COLORS.ink,
      fontFamily: BODY,
      paddingBottom: 86,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <header style={{
        background: COLORS.paper,
        borderBottom: `1px solid ${COLORS.line}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: 'max(14px, env(safe-area-inset-top)) 18px 12px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: 600,
          margin: '0 auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MiniMeLogo size={26} color={COLORS.ink} accent={COLORS.gold} />
            <span style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 22,
              letterSpacing: '-0.015em',
              color: COLORS.ink
            }}>
              minime
            </span>
          </div>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: COLORS.inkSoft, fontWeight: 500 }}>
                {user.first_name}
              </span>
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.first_name}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', objectFit: 'cover',
                    border: `1.5px solid ${COLORS.goldSoft}`
                  }}
                />
              ) : (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: COLORS.cream,
                  border: `1.5px solid ${COLORS.goldSoft}`,
                  display: 'grid', placeItems: 'center',
                  fontFamily: SERIF, fontSize: 14, color: COLORS.gold
                }}>
                  {(user.first_name || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main style={{
        flex: 1,
        maxWidth: 600,
        width: '100%',
        margin: '0 auto',
        padding: '20px 18px'
      }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: COLORS.paper,
        borderTop: `1px solid ${COLORS.line}`,
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'space-around',
        zIndex: 100
      }}>
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '6px 14px',
                textDecoration: 'none',
                color: isActive ? COLORS.ink : COLORS.muted,
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: '0.02em',
                transition: 'color 0.15s'
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.6} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default Layout
