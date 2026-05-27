import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inbox from './pages/Inbox'
import Products from './pages/Products'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Customers from './pages/Customers'
import Persona from './pages/Persona'
import './styles/App.css'

function App() {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      try { tg.ready() } catch {}
      try { tg.expand() } catch {}
      if (tg.initDataUnsafe?.user) setUser(tg.initDataUnsafe.user)
      if (tg.initData) {
        fetch('/miniapp/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: tg.initData })
        }).then(r => r.json()).then(d => {
          if (d.token) localStorage.setItem('minime_token', d.token)
        }).catch(() => {})
      }
    }
    // Short delay so Telegram SDK can populate data, then show app
    setTimeout(() => setReady(true), 800)
  }, [])

  if (!ready) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at center, #14342E 0%, #0A1E1B 80%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Georgia, serif', color: '#F4EEE1'
      }}>
        <svg width="72" height="72" viewBox="0 0 100 100" fill="none">
          <path d="M18 50 Q18 22 34 22 Q50 22 50 50 Q50 22 66 22 Q82 22 82 50"
            stroke="#F4EEE1" strokeWidth="5" strokeLinecap="round" fill="none"/>
          <circle cx="50" cy="34" r="3.5" fill="#F4EEE1"/>
          <line x1="14" y1="50" x2="86" y2="50" stroke="#D4B987" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M18 50 Q18 78 34 78 Q50 78 50 50 Q50 78 66 78 Q82 78 82 50"
            stroke="#F4EEE1" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.38"/>
        </svg>
        <div style={{ fontSize: 28, fontStyle: 'italic', fontWeight: 300, marginTop: 20, letterSpacing: '-0.01em' }}>
          minime
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 10, opacity: 0.5 }}>
          your business, mirrored
        </div>
      </div>
    )
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/products" element={<Products />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/persona" element={<Persona />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
