import React, { useState, useEffect } from 'react'
import { Bell, Moon, Globe, Shield, Zap, Clock } from 'lucide-react'
import '../styles/Settings.css'

function Settings() {
  const [settings, setSettings] = useState({
    primaryMode: 'secretary',
    fallbackToBot: true,
    fallbackAfterMinutes: 30,
    autoReply: false,
    shadowMode: true,
    notifyOnSale: true,
    allowReferrals: true,
    languages: ['en', 'am'],
    businessHours: {
      mon: '9-18',
      tue: '9-18',
      wed: '9-18',
      thu: '9-18',
      fri: '9-18',
      sat: '9-14',
      sun: 'closed'
    }
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('minime_token')
      const response = await fetch('/miniapp/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id
        })
      })

      const data = await response.json()
      if (data.business?.rules) {
        setSettings({
          primaryMode: data.business.primary_mode,
          fallbackToBot: data.business.fallback_to_bot,
          fallbackAfterMinutes: data.business.fallback_after_minutes,
          ...data.business.rules
        })
      }
    } catch (error) {
      console.error('Settings fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const token = localStorage.getItem('minime_token')
      await fetch('/miniapp/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Telegram ${token}`
        },
        body: JSON.stringify({ 
          userId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
          settings: {
            primaryMode: settings.primaryMode,
            fallbackToBot: settings.fallbackToBot,
            fallbackAfterMinutes: settings.fallbackAfterMinutes,
            autoReply: settings.autoReply,
            shadowMode: settings.shadowMode,
            notifyOnSale: settings.notifyOnSale,
            allowReferrals: settings.allowReferrals,
            languages: settings.languages,
            businessHours: settings.businessHours
          }
        })
      })

      // Show success
      window.Telegram?.WebApp?.showPopup?.({
        title: 'Saved',
        message: 'Your settings have been updated'
      })
    } catch (error) {
      console.error('Save error:', error)
    } finally {
      setSaving(false)
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
    <div className="settings">
      <h1 className="page-title">Settings</h1>

      {/* Mode Settings */}
      <div className="settings-section">
        <h2><Zap size={18} /> Mode</h2>

        <div className="setting-item">
          <div className="setting-info">
            <span className="setting-label">Primary Mode</span>
            <span className="setting-desc">How you want to handle customer messages</span>
          </div>
          <select 
            value={settings.primaryMode}
            onChange={(e) => setSettings({ ...settings, primaryMode: e.target.value })}
          >
            <option value="secretary">👤 Secretary (Reply as You)</option>
            <option value="bot">🤖 Bot (Dedicated Bot)</option>
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <span className="setting-label">Fallback to Bot</span>
            <span className="setting-desc">Auto-switch to bot when you're offline</span>
          </div>
          <label className="toggle">
            <input 
              type="checkbox"
              checked={settings.fallbackToBot}
              onChange={(e) => setSettings({ ...settings, fallbackToBot: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {settings.fallbackToBot && (
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Fallback After</span>
              <span className="setting-desc">Minutes of inactivity before bot takes over</span>
            </div>
            <select
              value={settings.fallbackAfterMinutes}
              onChange={(e) => setSettings({ ...settings, fallbackAfterMinutes: parseInt(e.target.value) })}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </div>
        )}
      </div>

      {/* AI Settings */}
      <div className="settings-section">
        <h2><Shield size={18} /> AI Behavior</h2>

        <div className="setting-item">
          <div className="setting-info">
            <span className="setting-label">Shadow Mode</span>
            <span className="setting-desc">AI suggests replies, you approve before sending</span>
          </div>
          <label className="toggle">
            <input 
              type="checkbox"
              checked={settings.shadowMode}
              onChange={(e) => setSettings({ ...settings, shadowMode: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <span className="setting-label">Auto-Reply</span>
            <span className="setting-desc">AI replies immediately without approval</span>
          </div>
          <label className="toggle">
            <input 
              type="checkbox"
              checked={settings.autoReply}
              onChange={(e) => setSettings({ ...settings, autoReply: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <h2><Bell size={18} /> Notifications</h2>

        <div className="setting-item">
          <div className="setting-info">
            <span className="setting-label">Notify on Sale</span>
            <span className="setting-desc">Get notified when a reservation is made</span>
          </div>
          <label className="toggle">
            <input 
              type="checkbox"
              checked={settings.notifyOnSale}
              onChange={(e) => setSettings({ ...settings, notifyOnSale: e.target.checked })}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      {/* Business Hours */}
      <div className="settings-section">
        <h2><Clock size={18} /> Business Hours</h2>

        {Object.entries(settings.businessHours || {}).map(([day, hours]) => (
          <div key={day} className="setting-item">
            <div className="setting-info">
              <span className="setting-label">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
            </div>
            <input 
              type="text"
              value={hours}
              onChange={(e) => {
                const newHours = { ...settings.businessHours, [day]: e.target.value }
                setSettings({ ...settings, businessHours: newHours })
              }}
              className="hours-input"
              placeholder="9-18 or closed"
            />
          </div>
        ))}
      </div>

      {/* Save Button */}
      <button 
        className="save-btn"
        onClick={saveSettings}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}

export default Settings