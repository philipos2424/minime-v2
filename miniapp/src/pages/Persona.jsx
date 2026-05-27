import React, { useState, useEffect } from 'react'
import { Check, ChevronLeft } from 'lucide-react'

const C = {
  ink: '#0E2823', inkSoft: '#4A5E5A', muted: '#8A9590',
  line: '#E4DED1', lineSoft: '#EEE9DE', cream: '#F4EEE1',
  paper: '#FBF8F1', gold: '#B08A4A', mint: '#4FA38A'
}
const SERIF = "'Georgia', 'Newsreader', serif"

const TONES = [
  { id: 'warm', label: 'Warm', sub: 'Friendly, Ethiopian shopkeeper energy' },
  { id: 'direct', label: 'Direct', sub: 'Brief, no fluff, just facts' },
  { id: 'professional', label: 'Professional', sub: 'Polite, formal' }
]
const LANGS = [
  { id: 'mixed', label: 'Mixed', sub: 'Natural Amharic-English (recommended)' },
  { id: 'en', label: 'English', sub: 'English only' },
  { id: 'am', label: 'አማርኛ', sub: 'Amharic only' }
]

export default function Persona({ onBack }) {
  const [form, setForm] = useState({ assistant_name: '', tone: 'warm', language_preference: 'mixed', shadow_mode: true })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.initData) return
    fetch('/miniapp/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, userId: tg.initDataUnsafe?.user?.id })
    }).then(r => r.json()).then(d => {
      if (d.business) {
        setForm({
          assistant_name: d.business.assistant_name || 'MiniMe',
          tone: d.business.tone || 'warm',
          language_preference: d.business.language_preference || 'mixed',
          shadow_mode: d.business.rules?.shadow_mode !== false
        })
      }
    }).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const tg = window.Telegram?.WebApp
      await fetch('/miniapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg?.initData,
          userId: tg?.initDataUnsafe?.user?.id,
          assistant_name: form.assistant_name,
          tone: form.tone,
          language_preference: form.language_preference,
          shadow_mode: form.shadow_mode
        })
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ fontFamily: "'Geist', system-ui, sans-serif", color: C.ink, paddingBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid ${C.line}` }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink, padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
        )}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold }}>Brain</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 400, letterSpacing: '-0.015em', margin: 0 }}>Assistant Persona</h1>
        </div>
      </div>

      {/* Name */}
      <Section title="Assistant name">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Customers see this name when chatting. Try something personal like "Selam" or "Hana".</p>
        <input
          value={form.assistant_name}
          onChange={e => setForm(f => ({ ...f, assistant_name: e.target.value }))}
          maxLength={30}
          placeholder="e.g. Selam, Hana, Alex"
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12,
            border: `1.5px solid ${C.line}`, background: '#fff',
            fontSize: 15, fontFamily: 'inherit', color: C.ink, outline: 'none',
            boxSizing: 'border-box'
          }}
        />
      </Section>

      {/* Tone */}
      <Section title="Tone">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TONES.map(t => (
            <button key={t.id} onClick={() => setForm(f => ({ ...f, tone: t.id }))} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1.5px solid ${form.tone === t.id ? C.ink : C.line}`,
              background: form.tone === t.id ? C.cream : '#fff',
              textAlign: 'left', fontFamily: 'inherit'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{t.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{t.sub}</div>
              </div>
              {form.tone === t.id && <Check size={16} color={C.ink} />}
            </button>
          ))}
        </div>
      </Section>

      {/* Language */}
      <Section title="Language">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {LANGS.map(l => (
            <button key={l.id} onClick={() => setForm(f => ({ ...f, language_preference: l.id }))} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: `1.5px solid ${form.language_preference === l.id ? C.ink : C.line}`,
              background: form.language_preference === l.id ? C.cream : '#fff',
              textAlign: 'left', fontFamily: 'inherit'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{l.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l.sub}</div>
              </div>
              {form.language_preference === l.id && <Check size={16} color={C.ink} />}
            </button>
          ))}
        </div>
      </Section>

      {/* Shadow mode */}
      <Section title="Shadow mode">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', border: `1px solid ${C.lineSoft}`, borderRadius: 12, padding: '14px 16px'
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>Approve replies before sending</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {form.shadow_mode ? 'ON — drafts come to you first' : 'OFF — replies go directly to customers'}
            </div>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, shadow_mode: !f.shadow_mode }))}
            style={{
              width: 46, height: 26, borderRadius: 999, border: 'none',
              background: form.shadow_mode ? C.ink : C.line, cursor: 'pointer',
              position: 'relative', transition: 'background .2s', flexShrink: 0
            }}
          >
            <span style={{
              position: 'absolute', top: 3, width: 20, height: 20,
              borderRadius: '50%', background: '#fff',
              transition: 'left .2s', left: form.shadow_mode ? 23 : 3,
              boxShadow: '0 1px 3px rgba(0,0,0,.15)'
            }} />
          </button>
        </div>
      </Section>

      {/* Save */}
      <button onClick={save} disabled={saving} style={{
        width: '100%', padding: '15px', borderRadius: 999, border: 'none',
        background: saved ? C.mint : (saving ? '#C8C0B8' : C.ink),
        color: '#fff', fontSize: 15, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
        fontFamily: 'inherit', marginTop: 8, transition: 'background .2s'
      }}>
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}
