import React, { useState, useEffect } from 'react'
import { Search, Filter, CheckCircle, XCircle, MessageSquare } from 'lucide-react'
import '../styles/Inbox.css'

function Inbox() {
  const [conversations, setConversations] = useState([])
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInbox()
  }, [filter])

  const fetchInbox = async () => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
          filter,
          page: 1,
          limit: 50
        })
      })

      const data = await response.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Inbox fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (conversationId) => {
    try {
      const token = localStorage.getItem('minime_token')
      await fetch('/miniapp/conversations/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ conversationId })
      })

      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, read_by_owner: true } : c)
      )
    } catch (error) {
      console.error('Mark read error:', error)
    }
  }

  const filteredConversations = conversations.filter(c => {
    if (searchQuery) {
      return c.customer_message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="inbox">
      <h1 className="page-title">Inbox</h1>

      <div className="inbox-filters">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-tabs">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={filter === 'unread' ? 'active' : ''}
            onClick={() => setFilter('unread')}
          >
            Unread
          </button>
          <button 
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
        </div>
      </div>

      <div className="conversations-list">
        {filteredConversations.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={40} />
            <p>No conversations found</p>
          </div>
        ) : (
          filteredConversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-card ${!conv.read_by_owner ? 'unread' : ''}`}
              onClick={() => markAsRead(conv.id)}
            >
              <div className="conv-header">
                <div className="conv-customer">
                  <div className="customer-avatar">
                    {conv.customer_name?.[0] || 'C'}
                  </div>
                  <div className="customer-info">
                    <span className="customer-name">{conv.customer_name || 'Customer'}</span>
                    <span className="conv-time">
                      {new Date(conv.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {!conv.read_by_owner && <div className="unread-dot"></div>}
              </div>

              <p className="conv-preview">{conv.customer_message}</p>

              <div className="conv-footer">
                <span className={`mode-tag ${conv.mode_used}`}>
                  {conv.mode_used === 'bot' && '🤖 AI Reply'}
                  {conv.mode_used === 'owner_reply' && '👤 Your Reply'}
                  {conv.mode_used === 'fallback_bot' && '⚡ Fallback'}
                </span>

                {conv.confidence && (
                  <span className="confidence-badge">
                    {conv.confidence}% match
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Inbox