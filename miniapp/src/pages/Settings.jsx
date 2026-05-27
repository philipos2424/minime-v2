import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, User, GraduationCap, MessageCircle, Shield, Sparkles,
  Bot, BookOpen, Coins, AlarmClock, Sun, Moon, Bell,
  Users, CreditCard, ChevronRight, Brain
} from 'lucide-react'

const COLORS = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', lineSoft: '#EEE9DE',
  cream: '#F4EEE1', cream2: '#EDE6D6', paper: '#FBF8F1',
  gold: '#B08A4A', goldSoft: '#D4B987', mint: '#4FA38A'
}
const SERIF = "'Georgia', 'Newsreader', serif"
const BODY = "'Geist', 'Inter', system-ui, sans-serif"

const GROUPS = [
  {
    title: 'Your Business',
    items: [
      { id: 'customers', route: '/customers', Icon: Users, label: 'Customers', sub: 'View your customer list' },
      { id: 'profile', Icon: Building2, label: 'Business Profile', sub: 'Name, category, address, links' },
    ]
  },
  {
    title: 'Brain',
    items: [
      { id: 'persona', route: '/settings/persona', Icon: Brain, label: 'Assistant Persona', sub: 'Name, tone, language, shadow mode' },
      { id: 'teach', Icon: GraduationCap, label: 'Teach MiniMe', sub: '/teach · /rule · forward messages' },
      { id: 'advisor', Icon: Sparkles, label: 'Ask Advisor', sub: '/advisor in Telegram', badge: 'Bot' }
    ]
  },
  {
    title: 'Channels',
    items: [
      { id: 'bot', Icon: Bot, label: 'Telegram bot', sub: '/connectbot to link your own bot' },
      { id: 'payments', Icon: Coins, label: 'Payments', sub: 'Chapa, Telebirr, Stars' }
    ]
  },
  {
    title: 'Rhythm',
    items: [
      { id: 'hours', Icon: Moon, label: 'Availability', sub: '24/7 or quiet hours via /shadow' },
      { id: 'voice', Icon: Bell, label: 'Voice & style', sub: 'Forward messages to teach the AI' }
    ]
  },
  {
    title: 'Account',
    items: [
      { id: 'billing', Icon: CreditCard, label: 'Billing', sub: 'Subscription and plan' }
    ]
  }
]

function NavRow({ Icon, label, sub, badge, last, dotMint, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '13px 14px',
      cursor: onClick ? 'pointer' : 'default',
      borderBottom: last ? 'none' : `1px solid ${COLORS.lineSoft}`
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: COLORS.cream,
        display: 'grid', placeItems: 'center', flexShrink: 0
      }}>
        <Icon size={17} color={COLORS.ink} strokeWidth={1.6} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5,
          color: COLORS.ink,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          {label}
          {dotMint && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: COLORS.mint, display: 'inline-block'
            }} />
          )}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2, lineHeight: 1.4 }}>
            {sub}
          </div>
        )}
      </div>
      {badge && (
        <span style={{
          fontSize: 11,
          color: COLORS.gold,
          background: 'rgba(176,138,74,0.1)',
          padding: '2px 8px',
          borderRadius: 999,
          fontWeight: 500
        }}>
          {badge}
        </span>
      )}
      <ChevronRight size={18} color={COLORS.muted} strokeWidth={1.5} />
    </div>
  )
}

function Settings() {
  const [business, setBusiness] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) return
    fetch('/miniapp/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        userId: tg.initDataUnsafe?.user?.id
      })
    })
      .then(r => r.json())
      .then(data => { if (data.business) setBusiness(data.business) })
      .catch(() => {})
  }, [])

  const ownerFirst = (business?.owner_name || '').split(' ')[0]
  const plan = business?.subscription_plan || 'Free'

  return (
    <div style={{ fontFamily: BODY, color: COLORS.ink, paddingBottom: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: COLORS.gold, marginBottom: 6
        }}>
          Account
        </div>
        <h1 style={{
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 400,
          letterSpacing: '-0.015em',
          color: COLORS.ink,
          margin: 0
        }}>
          Settings
        </h1>
      </div>

      {/* Profile card */}
      <div style={{
        border: `1px solid ${COLORS.line}`,
        borderRadius: 16,
        background: COLORS.cream,
        padding: 16,
        marginBottom: 22,
        display: 'flex',
        alignItems: 'center',
        gap: 14
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#E8D3A6',
          display: 'grid', placeItems: 'center', flexShrink: 0,
          fontFamily: SERIF, fontSize: 22, color: '#5C4520'
        }}>
          {(ownerFirst || business?.business_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink }}>
            {business?.owner_name || business?.business_name || 'Your business'}
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
            {business?.business_name || '—'} · {plan} plan
          </div>
        </div>
        <ChevronRight size={18} color={COLORS.muted} strokeWidth={1.5} />
      </div>

      {/* Groups */}
      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8
          }}>
            {group.title}
          </div>
          <div style={{
            background: '#fff',
            border: `1px solid ${COLORS.lineSoft}`,
            borderRadius: 16,
            overflow: 'hidden'
          }}>
            {group.items.map((item, i) => (
              <NavRow
                key={item.id}
                Icon={item.Icon}
                label={item.label}
                sub={item.sub}
                badge={item.badge}
                last={i === group.items.length - 1}
                dotMint={item.id === 'bot' && (business?.bot_username || business?.shop_code)}
                onClick={item.route ? () => navigate(item.route) : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Logout */}
      <button
        onClick={() => {
          try { localStorage.removeItem('minime_token') } catch {}
          try { window.Telegram?.WebApp?.close?.() } catch {}
          // If close didn't work, reload
          setTimeout(() => window.location.reload(), 200)
        }}
        style={{
          width: '100%',
          background: '#fff',
          border: `1px solid ${COLORS.line}`,
          color: COLORS.error || '#B85450',
          padding: '14px',
          borderRadius: 16,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: BODY,
          cursor: 'pointer',
          marginTop: 8,
          marginBottom: 16
        }}
      >
        Log out
      </button>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 8,
        fontSize: 11,
        color: COLORS.muted,
        letterSpacing: '0.06em'
      }}>
        MiniMe v2 · made for Ethiopian businesses
      </div>
    </div>
  )
}

export default Settings
