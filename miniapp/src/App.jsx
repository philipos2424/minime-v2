import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { Splash } from './components/Splash'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Products from './pages/Products'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import './styles/App.css'

function App() {
  const [user, setUser] = useState(null)
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    // Use window.Telegram.WebApp directly — most reliable approach
    const tg = window.Telegram?.WebApp
    if (tg) {
      try { tg.ready() } catch {}
      try { tg.expand() } catch {}
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user)
      }
      if (tg.initData) {
        fetch('/miniapp/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: tg.initData })
        })
          .then(r => r.json())
          .then(data => {
            if (data.token) localStorage.setItem('minime_token', data.token)
          })
          .catch(() => {})
      }
    }
  }, [])

  if (!splashDone) {
    return <Splash onDone={() => setSplashDone(true)} />
  }

  return (
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
  )
}

export default App
