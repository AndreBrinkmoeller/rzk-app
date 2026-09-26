import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import logoSvg from './logo-svg.js'
import { supabase } from '../lib/supabase.js'

const PATHS = {
  start: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  termine: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  abstimmen: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  kasse: '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 6V4h12v2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  mehr: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  foto: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 8"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
}

export function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
  )
}

export function Logo() {
  return <span className="logo" dangerouslySetInnerHTML={{ __html: logoSvg }} />
}

export function Avatar({ m, size = 40 }) {
  const n = m ? (m.nickname || m.first_name || '?') : '?'
  return <div className="av" style={{ background: m?.color || '#62677A', width: size, height: size }}>{n[0]}</div>
}

export function Sheet({ onClose, children, label }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="sheet" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pan" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        <button className="close" onClick={onClose}>Schließen</button>
        {children}
      </div>
    </div>
  )
}

// Bestätigung im Sheet statt confirm()
export function ConfirmButton({ label, confirmLabel = 'Wirklich?', onConfirm, className = 'btn ghost' }) {
  const [ask, setAsk] = useState(false)
  useEffect(() => { if (ask) { const t = setTimeout(() => setAsk(false), 4000); return () => clearTimeout(t) } }, [ask])
  return <button type="button" className={className} onClick={() => (ask ? (setAsk(false), onConfirm()) : setAsk(true))}>{ask ? confirmLabel : label}</button>
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  const timer = useRef()
  const show = useCallback((title, body) => {
    clearTimeout(timer.current)
    setT({ title, body, k: Date.now() })
    timer.current = setTimeout(() => setT(null), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className="toast" role="status" key={t.k}>
          <img src="/icons/rzk-icon-192.png" alt="" />
          <div><small>RAMBO ZAMBO</small><b>{t.title}</b>{t.body && <small style={{ fontSize: 13, color: 'var(--ink)' }}>{t.body}</small>}</div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// Lädt Daten und lädt neu, sobald sich eine der Tabellen ändert (Realtime).
export function useLive(loader, tables = [], deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const ref = useRef(loader)
  ref.current = loader
  const reload = useCallback(async () => {
    try { setData(await ref.current()); setError(null) } catch (e) { setError(e) }
  }, [])
  useEffect(() => {
    reload()
    if (!supabase || !tables.length) return
    let t
    const ch = supabase.channel('live-' + tables.join('-') + '-' + Math.random().toString(36).slice(2))
    tables.forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      clearTimeout(t); t = setTimeout(reload, 150)
    }))
    ch.subscribe()
    const vis = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', vis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, reload }
}

// Supabase-Ergebnis prüfen
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="card" style={{ color: 'var(--red)', marginTop: 12 }}>Das hat nicht geklappt: {error.message || String(error)}. Prüfe deine Verbindung und versuche es noch einmal.</p>
}

export function Loading() {
  return <p className="empty">Lädt …</p>
}
