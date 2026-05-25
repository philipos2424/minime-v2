import React, { useState, useEffect } from 'react'
import { 
  MessageCircle, 
  TrendingUp, 
  Clock, 
  Star,
  AlertCircle,
  ChevronRight
} from 'lucide-react'
import '../styles/Dashboard.css'

function Dashboard() {
  const [stats, setStats] = useState({
    todayConversations: 0,
    unreadCount: 0,
    pendingCount: 0,
    rating: 0,
    responseTime: 0
  })
  const [recentMessages, setRecentMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id })
      })

      const data = await response.json()
      if (data) {
        setStats({
          todayConversations: data.stats?.total_conversations || 0,
          unreadCount: data.unreadCount || 0,
          pendingCount: data.pendingCount || 0,
          rating: data.business?.average_rating || 0,
          responseTime: data.business?.avg_response_time || 0
        })
        setRecentMessages(data.recentConversations || [])
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <h1 className="page-title">Dashboard</h1>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">
            <MessageCircle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.todayConversations}</span>
            <span className="stat-label">Today's Chats</span>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon">
            <AlertCircle size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.unreadCount}</span>
            <span className="stat-label">Unread</span>
          </div>
        </div>

        <div className="stat-card info">
          <div className="stat-icon">
            <Clock size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">
              {stats.responseTime ? `${Math.round(stats.responseTime)}s` : 'N/A'}
            </span>
            <span className="stat-label">Avg Response</span>
          </div>
        </div>

        <div className="stat-card success">
          <div className="stat-icon">
            <Star size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{stats.rating.toFixed(1)}</span>
            <span className="stat-label">Rating</span>
          </div>
        </div>
      </div>

      {/* Pending Actions */}
      {(stats.unreadCount > 0 || stats.pendingCount > 0) && (
        <div className="pending-section">
          <h2>Needs Attention</h2>
          <div className="pending-cards">
            {stats.unreadCount > 0 && (
              <div className="pending-card">
                <div className="pending-info">
                  <MessageCircle size={16} />
                  <span>{stats.unreadCount} unread messages</span>
                </div>
                <ChevronRight size={16} />
              </div>
            )}
            {stats.pendingCount > 0 && (
              <div className="pending-card">
                <div className="pending-info">
                  <AlertCircle size={16} />
                  <span>{stats.pendingCount} pending approvals</span>
                </div>
                <ChevronRight size={16} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="recent-section">
        <h2>Recent Activity</h2>
        {recentMessages.length === 0 ? (
          <div className="empty-state">
            <MessageCircle size={40} />
            <p>No conversations yet today</p>
            <span>Your AI assistant is handling customer messages</span>
          </div>
        ) : (
          <div className="message-list">
            {recentMessages.map(msg => (
              <div key={msg.id} className={`message-card ${!msg.read_by_owner ? 'unread' : ''}`}>
                <div className="message-header">
                  <span className="customer-name">{msg.customer_name || 'Customer'}</span>
                  <span className="message-time">
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                <p className="message-preview">{msg.customer_message}</p>
                <div className="message-meta">
                  <span className={`mode-badge ${msg.mode_used}`}>
                    {msg.mode_used === 'bot' ? '🤖 AI' : msg.mode_used === 'owner_reply' ? '👤 You' : '⚡ Fallback'}
                  </span>
                  {msg.confidence && (
                    <span className="confidence">{msg.confidence}% match</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-grid">
          <button className="action-btn">
            <TrendingUp size={20} />
            <span>Add Product</span>
          </button>
          <button className="action-btn">
            <Star size={20} />
            <span>View Reviews</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dashboard