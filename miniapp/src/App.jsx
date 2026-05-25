import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTelegramWebApp } from '@vkruglikov/react-telegram-web-app'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Products from './pages/Products'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import './styles/App.css'

function App() {
  const { ready, expand } = useTelegramWebApp()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ready) {
      expand()
      // Get user from Telegram WebApp
      const tg = window.Telegram?.WebApp
      if (tg?.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user)
        // Authenticate with backend
        authenticateUser(tg.initData)
      }
      setLoading(false)
    }
  }, [ready, expand])

  const authenticateUser = async (initData) => {
    try {
      const response = await fetch('/miniapp/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      })
      const data = await response.json()
      if (data.token) {
        localStorage.setItem('minime_token', data.token)
      }
    } catch (error) {
      console.error('Auth error:', error)
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading MiniMe...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/products" element={<Products />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </div>
  )
}

export default App