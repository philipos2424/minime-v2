import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useWebApp } from '@vkruglikov/react-telegram-web-app'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Products from './pages/Products'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import './styles/App.css'

function App() {
  const webApp = useWebApp()
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Expand to full screen
    try { webApp?.expand?.() } catch {}

    // Get user from Telegram WebApp
    const tg = window.Telegram?.WebApp
    if (tg) {
      try { tg.ready?.() } catch {}
      try { tg.expand?.() } catch {}
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user)
      }
      if (tg.initData) {
        authenticateUser(tg.initData)
      }
    }
  }, [webApp])

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
