import React, { useEffect, useState } from 'react'
import { MiniMeLogo } from './MiniMeLogo'

export function Splash({ onDone }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const p1 = setTimeout(() => setPhase(1), 250)
    const p2 = setTimeout(() => setPhase(2), 700)
    let p = 0
    const iv = setInterval(() => {
      p += Math.random() * 22 + 8
      if (p >= 100) {
        p = 100
        clearInterval(iv)
        setTimeout(() => onDone?.(), 350)
      }
      setProgress(Math.min(p, 100))
    }, 120)
    return () => { clearTimeout(p1); clearTimeout(p2); clearInterval(iv) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at center, #14342E 0%, #0A1E1B 80%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Geist', 'Inter', system-ui, sans-serif", overflow: 'hidden',
    }}>
      <div style={{
        opacity: phase >= 0 ? 1 : 0,
        transform: phase >= 0 ? 'scale(1)' : 'scale(0.9)',
        transition: 'opacity 800ms ease, transform 800ms cubic-bezier(0.16, 1, 0.3, 1)',
        marginBottom: 28
      }}>
        <MiniMeLogo size={86} color="#F4EEE1" accent="#D4B987" />
      </div>

      <div style={{
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? 'translateY(0)' : 'translateY(8px)',
        transition: 'all 600ms ease 100ms',
        textAlign: 'center'
      }}>
        <div style={{
          fontFamily: "'Georgia', 'Newsreader', serif",
          fontWeight: 300, fontStyle: 'italic',
          fontSize: 34, color: '#F4EEE1',
          letterSpacing: '-0.015em'
        }}>
          minime
        </div>
        <div style={{
          opacity: phase >= 2 ? 1 : 0,
          transition: 'opacity 600ms ease 300ms',
          marginTop: 10, color: 'rgba(244,238,225,0.55)',
          letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 10
        }}>
          your business, mirrored
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 90, left: 50, right: 50,
        height: 2, background: 'rgba(244,238,225,0.08)', borderRadius: 1, overflow: 'hidden'
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: '#D4B987',
          transition: 'width 200ms ease-out'
        }} />
      </div>

      <div style={{
        position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center',
        fontSize: 11, color: 'rgba(244,238,225,0.35)',
        letterSpacing: '0.2em', textTransform: 'uppercase'
      }}>
        {progress < 40 ? 'Connecting…' : progress < 75 ? 'Loading your business…' : progress < 95 ? 'Almost ready…' : 'Ready'}
      </div>
    </div>
  )
}
