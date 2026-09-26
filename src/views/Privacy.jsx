import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Logo } from '../components/ui.jsx'

export function PrivacyText() {
  return (
    <div className="prose">
      <p>Die App ist nur für die Mitglieder des Rambo Zambo Kegelvereins. Sie wird von den Vergnügungswarten betrieben, nicht von einer Firma.</p>
      <p><b>Was gespeichert wird:</b> Name, Spitzname, E-Mail-Adresse, auf Wunsch Handynummer und Geburtstag, deine Zusagen, Stimmen, Chat-Nachrichten und hochgeladene Fotos.</p>
      <p><b>Wer das sieht:</b> Nur angemeldete Mitglieder. Ob dein Geburtstag mit Alter, ohne Alter oder gar nicht angezeigt wird, stellst du unter Mehr → Mein Profil ein.</p>
      <p><b>Wo die Daten liegen:</b> Bei Supabase auf Servern in Frankfurt. Die App selbst liegt bei Vercel. Push-Nachrichten laufen über die Dienste von Apple bzw. Google.</p>
      <p><b>Deine Rechte:</b> Du kannst jederzeit Auskunft verlangen, eigene Nachrichten und Fotos löschen und die Löschung deines Kontos bei den Vergnügungswarten beantragen.</p>
      <p><b>Fotos:</b> Lade nur Fotos hoch, mit denen die Abgebildeten einverstanden sind.</p>
    </div>
  )
}

export default function Privacy({ me, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function accept() {
    setBusy(true)
    const { error } = await supabase.from('members').update({ privacy_accepted_at: new Date().toISOString() }).eq('id', me.id)
    setBusy(false)
    if (error) return setErr('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    onDone()
  }
  return (
    <div className="app">
      <header className="top"><Logo /></header>
      <h1>Moin {me.nickname || me.first_name}!</h1>
      <p className="sub">Bevor es losgeht, kurz zum Datenschutz.</p>
      <div className="card" style={{ marginTop: 14 }}><PrivacyText /></div>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <p style={{ display: 'grid', gap: 10 }}>
        <button className="btn" onClick={accept} disabled={busy}>Verstanden, los geht’s</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </p>
    </div>
  )
}
