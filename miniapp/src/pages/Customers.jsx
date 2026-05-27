import React, { useState, useEffect } from 'react'
import { Users, TrendingUp, Clock } from 'lucide-react'

const C = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', lineSoft: '#EEE9DE', cream: '#F4EEE1',
  paper: '#FBF8F1', gold: '#B08A4A', mint: '#4FA38A'
}
const SERIF = "'Georgia', 'Newsreader', serif"

const TIER_COLORS = {
  gold: { bg: '#FFF3CC', color: '#B08A00', label: '🥇 Gold' },
  silver: { bg: '#F0F0F0', color: '#666', label: '🥈 Silver' },
  bronze: { bg: '#FFF0E6', color: '#B07040', label: '🥉 Bronze' }
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) { setLoading(false); return }
    fetch('/miniapp/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, userId: tg.initDataUnsafe?.user?.id })
    })
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading"><div className="spinner" /></div>

  const filtered = customers.filter(c =>
    !search || (c.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ fontFamily: "'Geist', system-ui, sans-serif", color: C.ink, paddingBottom: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, marginBottom: 6 }}>
          People
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', margin: 0 }}>
          Customers
        </h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{customers.length} total</p>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search customers…"
        style={{
          width: '100%', padding: '11px 14px', borderRadius: 999,
          border: `1px solid ${C.line}`, background: '#fff',
          fontSize: 14, fontFamily: 'inherit', color: C.ink,
          outline: 'none', boxSizing: 'border-box', marginBottom: 16
        }}
      />

      {filtered.length === 0 ? (
        <div style={{
          background: '#fff', border: `1px solid ${C.lineSoft}`,
          borderRadius: 16, padding: '40px 24px', textAlign: 'center'
        }}>
          <Users size={32} color={C.muted} style={{ opacity: 0.4, marginBottom: 10 }} />
          <p style={{ fontSize: 14, color: C.inkSoft, fontWeight: 500 }}>No customers yet</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>They'll appear here once they message your bot</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${C.lineSoft}`, borderRadius: 16, overflow: 'hidden' }}>
          {filtered.map((c, i) => {
            const tier = TIER_COLORS[c.tier] || null
            const lastSeen = c.last_active_at ? formatAge(c.last_active_at) : '—'
            return (
              <div key={c.id || i} style={{
                padding: '14px 16px',
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
                display: 'flex', gap: 12, alignItems: 'center'
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: C.cream,
                  display: 'grid', placeItems: 'center',
                  fontFamily: SERIF, fontSize: 16, color: C.gold, flexShrink: 0
                }}>
                  {(c.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{c.name || 'Unknown'}</span>
                    {tier && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '1px 7px',
                        borderRadius: 999, background: tier.bg, color: tier.color
                      }}>{tier.label}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                    <span style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <TrendingUp size={11} /> {c.total_orders || 0} orders
                    </span>
                    <span style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={11} /> {lastSeen}
                    </span>
                    {c.total_spent > 0 && (
                      <span style={{ fontSize: 12, color: C.mint, fontWeight: 500 }}>
                        {Number(c.total_spent).toLocaleString()} ETB
                      </span>
                    )}
                  </div>
                </div>
                {c.mood != null && (
                  <div style={{
                    fontSize: 11, color: c.mood >= 7 ? C.mint : c.mood >= 4 ? C.gold : '#B85450',
                    background: c.mood >= 7 ? 'rgba(79,163,138,0.1)' : c.mood >= 4 ? 'rgba(176,138,74,0.1)' : 'rgba(184,84,80,0.1)',
                    padding: '3px 8px', borderRadius: 999, fontWeight: 600
                  }}>
                    {c.mood}/10
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatAge(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}
