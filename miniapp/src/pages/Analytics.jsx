import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { TrendingUp, Users, MessageCircle, DollarSign } from 'lucide-react'
import '../styles/Analytics.css'

function Analytics() {
  const [period, setPeriod] = useState('7d')
  const [data, setData] = useState({ daily: [], totals: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
          period
        })
      })

      const result = await response.json()
      setData({
        daily: Array.isArray(result.daily) ? result.daily : [],
        totals: result.totals || {}
      })
    } catch (error) {
      console.error('Analytics fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const chartData = (data.daily || []).map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    conversations: day.total_conversations || 0,
    autoReplies: day.auto_replies || 0,
    leads: day.leads_generated || 0,
    fees: day.fees_earned || 0
  }))

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="analytics">
      <h1 className="page-title">Analytics</h1>

      <div className="period-selector">
        <button className={period === '7d' ? 'active' : ''} onClick={() => setPeriod('7d')}>7 Days</button>
        <button className={period === '30d' ? 'active' : ''} onClick={() => setPeriod('30d')}>30 Days</button>
        <button className={period === '90d' ? 'active' : ''} onClick={() => setPeriod('90d')}>90 Days</button>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <MessageCircle size={20} />
          <div>
            <span className="summary-value">{data.totals?.conversations || 0}</span>
            <span className="summary-label">Conversations</span>
          </div>
        </div>
        <div className="summary-card">
          <TrendingUp size={20} />
          <div>
            <span className="summary-value">{data.totals?.autoReplies || 0}</span>
            <span className="summary-label">AI Replies</span>
          </div>
        </div>
        <div className="summary-card">
          <Users size={20} />
          <div>
            <span className="summary-value">{data.totals?.leads || 0}</span>
            <span className="summary-label">Leads</span>
          </div>
        </div>
        <div className="summary-card">
          <DollarSign size={20} />
          <div>
            <span className="summary-value">{data.totals?.fees || 0} ETB</span>
            <span className="summary-label">Fees Earned</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-section">
        <div className="chart-card">
          <h3>Conversations</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  background: '#fff', 
                  border: '1px solid #E5E5E5',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="conversations" fill="#D4A574" radius={[4, 4, 0, 0]} />
              <Bar dataKey="autoReplies" fill="#8B6914" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Leads Generated</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  background: '#fff', 
                  border: '1px solid #E5E5E5',
                  borderRadius: '8px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="leads" 
                stroke="#C75B39" 
                strokeWidth={2}
                dot={{ fill: '#C75B39' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default Analytics