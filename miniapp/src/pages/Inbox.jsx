import React, { useEffect, useState } from 'react'
import { MessageSquare, ChevronLeft, Search, Bot, User as UserIcon } from 'lucide-react'

const COLORS = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', lineSoft: '#EEE9DE',
  cream: '#F4EEE1', cream2: '#EDE6D6', paper: '#FBF8F1',
  gold: '#B08A4A', goldSoft: '#D4B987', mint: '#4FA38A'
}
const SERIF = "'Georgia', 'Newsreader', serif"
const BODY = "'Geist', 'Inter', system-ui, sans-serif"

function Inbox() {
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null) // {conversation, messages}
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchInbox()
  }, [])

  const fetchInbox = async () => {
    setLoading(true)
    try {
      const tg = window.Telegram?.WebApp
      const res = await fetch('/miniapp/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg?.initData, userId: tg?.initDataUnsafe?.user?.id })
      })
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (e) {
      console.error('Inbox fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const openConversation = async (conv) => {
    setLoadingDetail(true)
    setActiveConv({ conversation: conv, messages: [] })
    try {
      const tg = window.Telegram?.WebApp
      const res = await fetch('/miniapp/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg?.initData,
          userId: tg?.initDataUnsafe?.user?.id,
          conversationId: conv.id
        })
      })
      const data = await res.json()
      setActiveConv({
        conversation: data.conversation || conv,
        messages: data.messages || []
      })
      // Mark as read in our list
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, read_by_owner: true } : c))
    } catch (e) {
      console.error('Conversation detail error:', e)
    } finally {
      setLoadingDetail(false)
    }
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────
  if (activeConv) {
    return <ConversationDetail
      conversation={activeConv.conversation}
      messages={activeConv.messages}
      loading={loadingDetail}
      onBack={() => setActiveConv(null)}
    />
  }

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  if (loading) {
    return <div className="page-loading"><div className="spinner" /></div>
  }

  const filtered = conversations.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.customer_name || '').toLowerCase().includes(q) ||
           (c.customer_message || '').toLowerCase().includes(q)
  })

  return (
    <div style={{ fontFamily: BODY, color: COLORS.ink, paddingBottom: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.gold, marginBottom: 6 }}>
          Conversations
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, letterSpacing: '-0.015em', color: COLORS.ink, margin: 0 }}>
          Inbox
        </h1>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 999,
        padding: '10px 16px', marginBottom: 18
      }}>
        <Search size={16} color={COLORS.muted} strokeWidth={1.8} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer or message…"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: COLORS.ink, fontSize: 14, fontFamily: BODY
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{
          background: '#fff', border: `1px solid ${COLORS.lineSoft}`,
          borderRadius: 16, padding: '40px 24px', textAlign: 'center'
        }}>
          <MessageSquare size={36} color={COLORS.muted} style={{ opacity: 0.4, marginBottom: 10 }} />
          <p style={{ fontSize: 14, color: COLORS.inkSoft, fontWeight: 500, marginBottom: 4 }}>
            {conversations.length ? 'No matches' : 'No conversations yet'}
          </p>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {conversations.length ? 'Try a different search' : 'Customer messages will appear here'}
          </span>
        </div>
      ) : (
        <div style={{
          background: '#fff', border: `1px solid ${COLORS.lineSoft}`,
          borderRadius: 16, overflow: 'hidden'
        }}>
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onClick={() => openConversation(c)}
              style={{
                padding: '14px 16px',
                borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.lineSoft}` : 'none',
                display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer'
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: c.read_by_owner ? COLORS.cream : COLORS.goldSoft,
                display: 'grid', placeItems: 'center',
                fontFamily: SERIF, fontSize: 14,
                color: c.read_by_owner ? COLORS.gold : '#5C4520',
                flexShrink: 0
              }}>
                {(c.customer_name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{
                    fontSize: 14, fontWeight: c.read_by_owner ? 500 : 600,
                    color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {c.customer_name}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, flexShrink: 0 }}>
                    {formatTime(c.created_at)}
                  </div>
                </div>
                <p style={{
                  fontSize: 13, color: COLORS.inkSoft, marginTop: 3, lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {c.customer_message || '(no message)'}
                </p>
                {c.message_count > 1 && (
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                    {c.message_count} messages
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conversation Detail Component ─────────────────────────────────────────
function ConversationDetail({ conversation, messages, loading, onBack }) {
  return (
    <div style={{ fontFamily: BODY, color: COLORS.ink, paddingBottom: 20 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${COLORS.line}`
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', padding: 4,
            cursor: 'pointer', color: COLORS.ink, display: 'grid', placeItems: 'center'
          }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: COLORS.goldSoft,
          display: 'grid', placeItems: 'center',
          fontFamily: SERIF, fontSize: 16, color: '#5C4520', flexShrink: 0
        }}>
          {(conversation.customer_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, color: COLORS.ink, lineHeight: 1.2 }}>
            {conversation.customer_name}
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            {conversation.total_orders || 0} orders · {conversation.message_count || messages.length} messages
          </div>
        </div>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="page-loading"><div className="spinner" /></div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.muted, fontSize: 13 }}>
          No messages yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || i} msg={msg} />
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }) {
  const isOutbound = msg.direction === 'outbound'
  const isAi = msg.is_ai_generated
  const isEdited = msg.owner_edited

  return (
    <div style={{
      display: 'flex',
      justifyContent: isOutbound ? 'flex-end' : 'flex-start',
      marginBottom: 2
    }}>
      <div style={{
        maxWidth: '78%',
        background: isOutbound ? COLORS.ink : '#fff',
        color: isOutbound ? COLORS.paper : COLORS.ink,
        border: isOutbound ? 'none' : `1px solid ${COLORS.lineSoft}`,
        borderRadius: 16,
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.45,
        boxShadow: isOutbound ? 'none' : '0 1px 0 rgba(14,40,35,.04)'
      }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {msg.content || '(no content)'}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10,
          color: isOutbound ? 'rgba(244,238,225,0.6)' : COLORS.muted,
          marginTop: 5
        }}>
          <span>{formatTime(msg.created_at)}</span>
          {isOutbound && isAi && !isEdited && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              · <Bot size={10} /> AI
              {msg.ai_confidence != null && ` · ${Math.round(msg.ai_confidence * 100)}%`}
            </span>
          )}
          {isOutbound && isEdited && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              · <UserIcon size={10} /> You (edited)
            </span>
          )}
          {isOutbound && !isAi && !isEdited && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              · <UserIcon size={10} /> You
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  const days = Math.floor((now - d) / 86400000)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default Inbox
