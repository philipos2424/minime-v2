import React, { useEffect, useState } from 'react'
import { MessageCircle, Star, Clock, AlertCircle, ChevronRight, TrendingUp, Plus } from 'lucide-react'

const COLORS = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', lineSoft: '#EEE9DE',
  cream: '#F4EEE1', cream2: '#EDE6D6', paper: '#FBF8F1',
  gold: '#B08A4A', goldSoft: '#D4B987', mint: '#4FA38A'
}
const SERIF = "'Georgia', 'Newsreader', serif"

function Dashboard() {
  const [stats, setStats] = useState({
    todayConversations: 0,
    unreadCount: 0,
    pendingCount: 0,
    rating: 0,
    responseTime: 0
  })
  const [recentMessages, setRecentMessages] = useState([])
  const [business, setBusiness] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) { setLoading(false); return }
    fetch('/miniapp/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        userId: tg.initDataUnsafe?.user?.id
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.business) setBusiness(data.business)
        setStats({
          todayConversations: data.stats?.total_conversations || 0,
          unreadCount: data.unreadCount || 0,
          pendingCount: data.pendingCount || 0,
          rating: data.business?.average_rating || 0,
          responseTime: data.business?.avg_response_time || 0
        })
        setRecentMessages(data.recentConversations || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="page-loading"><div className="spinner" /></div>
  }

  const assistantName = business?.assistant_name || 'MiniMe'
  const businessName = business?.business_name || 'Your business'

  return (
    <div style={{ fontFamily: "'Geist', system-ui, sans-serif", color: COLORS.ink, paddingBottom: 20 }}>
      {/* Greeting */}
      <div className="fade-up" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.gold, marginBottom: 6 }}>
          Today
        </div>
        <h1 style={{
          fontFamily: SERIF, fontSize: 28, fontWeight: 400,
          letterSpacing: '-0.015em', color: COLORS.ink, margin: 0, lineHeight: 1.2
        }}>
          {businessName}
        </h1>
        <p style={{ fontSize: 14, color: COLORS.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
          {assistantName} is handling your messages.
        </p>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        marginBottom: 24
      }}>
        <StatCard
          icon={<MessageCircle size={18} strokeWidth={1.6} color={COLORS.ink} />}
          value={stats.todayConversations}
          label="Today's chats"
          accent={COLORS.gold}
        />
        <StatCard
          icon={<AlertCircle size={18} strokeWidth={1.6} color={COLORS.ink} />}
          value={stats.unreadCount}
          label="Unread"
          accent={COLORS.error || '#B85450'}
          urgent={stats.unreadCount > 0}
        />
        <StatCard
          icon={<Clock size={18} strokeWidth={1.6} color={COLORS.ink} />}
          value={stats.responseTime ? `${Math.round(stats.responseTime)}s` : '—'}
          label="Avg response"
          accent={COLORS.mint}
        />
        <StatCard
          icon={<Star size={18} strokeWidth={1.6} color={COLORS.ink} />}
          value={stats.rating ? stats.rating.toFixed(1) : '—'}
          label="Rating"
          accent={COLORS.gold}
        />
      </div>

      {/* Pending approvals */}
      {stats.pendingCount > 0 && (
        <div className="fade-up" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8 }}>
            Needs your approval
          </div>
          <div style={{
            background: '#fff',
            border: `1px solid ${COLORS.gold}40`,
            borderRadius: 16,
            padding: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(176,138,74,0.12)',
              display: 'grid', placeItems: 'center'
            }}>
              <AlertCircle size={18} color={COLORS.gold} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>
                {stats.pendingCount} draft{stats.pendingCount === 1 ? '' : 's'} awaiting you
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                Open Telegram to approve, edit, or skip
              </div>
            </div>
            <ChevronRight size={18} color={COLORS.muted} />
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8 }}>
          Recent activity
        </div>
        {recentMessages.length === 0 ? (
          <div style={{
            background: '#fff',
            border: `1px solid ${COLORS.lineSoft}`,
            borderRadius: 16,
            padding: '36px 24px',
            textAlign: 'center'
          }}>
            <MessageCircle size={32} color={COLORS.muted} style={{ opacity: 0.5, marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: COLORS.inkSoft, fontWeight: 500, marginBottom: 4 }}>
              No conversations yet
            </p>
            <p style={{ fontSize: 12, color: COLORS.muted }}>
              When customers message you, they'll show up here.
            </p>
          </div>
        ) : (
          <div style={{
            background: '#fff',
            border: `1px solid ${COLORS.lineSoft}`,
            borderRadius: 16,
            overflow: 'hidden'
          }}>
            {recentMessages.slice(0, 5).map((msg, i) => (
              <div key={msg.id || i} style={{
                padding: '14px 16px',
                borderBottom: i < Math.min(recentMessages.length, 5) - 1 ? `1px solid ${COLORS.lineSoft}` : 'none',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: msg.read_by_owner ? COLORS.cream : COLORS.goldSoft,
                  display: 'grid', placeItems: 'center',
                  fontFamily: SERIF, fontSize: 14,
                  color: msg.read_by_owner ? COLORS.gold : '#5C4520',
                  flexShrink: 0
                }}>
                  {(msg.customer_name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.customer_name || 'Customer'}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, flexShrink: 0 }}>
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <p style={{
                    fontSize: 13,
                    color: COLORS.inkSoft,
                    marginTop: 3,
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {msg.customer_message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="fade-up">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 8 }}>
          Quick actions
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ActionCard icon={<Plus size={18} />} label="Add product" sub="Photo + price" />
          <ActionCard icon={<TrendingUp size={18} />} label="Get advice" sub="/advisor in Telegram" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label, accent, urgent }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${urgent ? accent + '40' : COLORS.lineSoft}`,
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: COLORS.cream,
        display: 'grid', placeItems: 'center'
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontFamily: SERIF,
          fontSize: 24,
          color: urgent ? accent : COLORS.ink,
          lineHeight: 1,
          letterSpacing: '-0.02em'
        }}>
          {value}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 4, fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </div>
  )
}

function ActionCard({ icon, label, sub }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${COLORS.lineSoft}`,
      borderRadius: 14,
      padding: '14px 16px',
      cursor: 'pointer'
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: COLORS.cream,
        display: 'grid', placeItems: 'center',
        color: COLORS.ink,
        marginBottom: 8
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{label}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

export default Dashboard
