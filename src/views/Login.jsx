import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Logo } from '../components/ui.jsx'

export default function Login() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function sendCode(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const addr = email.trim().toLowerCase()
    const { data: ok, error: e1 } = await supabase.rpc('email_is_member', { p_email: addr })
    if (e1) { setBusy(false); return setMsg('Keine Verbindung. Bitte später erneut versuchen.') }
    if (!ok) { setBusy(false); return setMsg('Diese Adresse ist nicht als Mitglied eingetragen. Sag Andre Bescheid, dann schaltet er dich frei.') }
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) return setMsg(error.status === 429 ? 'Zu viele Versuche. Bitte warte eine Minute.' : 'Der Code konnte nicht gesendet werden: ' + error.message)
    setEmail(addr); setStep('code')
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg('Der Code stimmt nicht oder ist abgelaufen. Prüfe die E-Mail oder fordere einen neuen an.')
  }

  return (
    <div className="app login">
      <header className="top"><Logo /></header>
      <h1>Anmelden</h1>
      {step === 'email' ? (
        <form className="f card" onSubmit={sendCode} style={{ marginTop: 14 }}>
          <p className="sub" style={{ margin: 0 }}>Gib deine E-Mail-Adresse ein. Du bekommst einen Code, mit dem du dich anmeldest. Ein Passwort brauchst du nicht.</p>
          <label>E-Mail-Adresse<input id="login-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Sende …' : 'Code senden'}</button>
        </form>
      ) : (
        <form className="f card" onSubmit={verify} style={{ marginTop: 14 }}>
          <p className="sub" style={{ margin: 0 }}>Wir haben dir eine E-Mail an <b>{email}</b> geschickt. Gib den Code daraus ein oder tippe auf den Link in der E-Mail. Schau auch im Spam-Ordner nach.</p>
          <label>Code aus der E-Mail<input id="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ letterSpacing: '.3em', fontSize: 22, textAlign: 'center' }} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Prüfe …' : 'Anmelden'}</button>
          <button type="button" className="btn ghost" onClick={() => { setStep('email'); setCode(''); setMsg('') }}>Andere Adresse oder neuen Code</button>
        </form>
      )}
      {msg && <p className="card" role="alert" style={{ marginTop: 12, color: 'var(--red)' }}>{msg}</p>}
    </div>
  )
}
