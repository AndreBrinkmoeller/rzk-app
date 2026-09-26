import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { useLive, q, Sheet, useToast, Loading, ErrorNote, ConfirmButton } from '../components/ui.jsx'
import { fmt, today, iso, displayName } from '../lib/format.js'
import { notify } from '../lib/notify.js'

const isOpen = p => !p.closed && (!p.closes_on || p.closes_on >= iso(today()))

export default function Abstimmen() {
  const { me, nav } = useApp()
  const [creating, setCreating] = useState(false)
  const { data, error, reload } = useLive(async () => {
    const [polls, votes] = await Promise.all([
      q(supabase.from('polls').select('*').order('created_at', { ascending: false })),
      q(supabase.from('poll_votes').select('poll_id,member_id,answer'))
    ])
    return polls.map(p => ({ ...p, votes: votes.filter(v => v.poll_id === p.id) }))
  }, ['polls', 'poll_votes'], [])

  useEffect(() => {
    if (nav.open && data) document.getElementById('poll-' + nav.open)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [nav.open, data])

  if (!data) return <><h1>Abstimmen</h1>{error ? <ErrorNote error={error} /> : <Loading />}</>
  const open = data.filter(isOpen), done = data.filter(p => !isOpen(p))
  return (
    <>
      <h1>Abstimmen</h1>
      <p className="sub">Umfragen, Terminfindung und Ja/Nein-Fragen.</p>
      {me.is_admin && <p><button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setCreating(true)}>Abstimmung starten</button></p>}
      <h2>Laufend</h2>
      <div className="stack">
        {open.length === 0 && <p className="empty">Gerade läuft keine Abstimmung.</p>}
        {open.map(p => <Poll key={p.id} p={p} reload={reload} />)}
      </div>
      {done.length > 0 && <><h2>Beendet</h2><div className="stack">{done.map(p => <Poll key={p.id} p={p} reload={reload} />)}</div></>}
      {creating && <PollForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
    </>
  )
}

function Poll({ p, reload }) {
  const { me, dir, byId, reloadPolls } = useApp()
  const toast = useToast()
  const [showWho, setShowWho] = useState(false)
  const openNow = isOpen(p)
  const mine = p.votes.find(v => v.member_id === me.id)

  async function save(answer) {
    const { error } = answer
      ? await supabase.from('poll_votes').upsert({ poll_id: p.id, member_id: me.id, answer, updated_at: new Date().toISOString() })
      : await supabase.from('poll_votes').delete().match({ poll_id: p.id, member_id: me.id })
    if (error) return toast('Stimme nicht gespeichert', 'Die Abstimmung ist vielleicht schon beendet.')
    reload(); reloadPolls()
  }
  async function close() {
    const { error } = await supabase.from('polls').update({ closed: true }).eq('id', p.id)
    if (error) return toast('Nicht gespeichert')
    toast('Abstimmung beendet'); reload(); reloadPolls()
  }
  async function remove() {
    const { error } = await supabase.from('polls').delete().eq('id', p.id)
    if (error) return toast('Löschen fehlgeschlagen')
    reload(); reloadPolls()
  }

  const head = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        {!openNow ? <span className="pill">Beendet</span> : mine ? <span className="pill ok">Abgestimmt</span> : <span className="pill red">Deine Stimme fehlt</span>}
        <small style={{ color: 'var(--mute)' }}>{openNow && p.closes_on ? 'bis ' + fmt(p.closes_on, { day: 'numeric', month: 'short' }) : ''}</small>
      </div>
      <h3>{p.question}</h3>
      <small style={{ color: 'var(--mute)' }}>{p.votes.length} von {dir.length} haben abgestimmt · von {displayName(byId[p.created_by])}</small>
    </>
  )
  const admin = me.is_admin && (
    <p style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 0 }}>
      {openNow && <ConfirmButton label="Beenden" confirmLabel="Wirklich beenden?" onConfirm={close} />}
      <ConfirmButton label="Löschen" confirmLabel="Wirklich löschen?" onConfirm={remove} />
    </p>
  )

  if (p.kind === 'dates') {
    const cyc = { '': 'y', y: 'm', m: 'n', n: '' }
    const lab = { y: '✓', m: '?', n: '✕', '': '' }
    const myAns = mine?.answer || p.options.map(() => '')
    const others = p.votes.filter(v => v.member_id !== me.id)
    const score = p.options.map((_, i) => p.votes.reduce((s, v) => s + (v.answer[i] === 'y' ? 2 : v.answer[i] === 'm' ? 1 : 0), 0))
    const best = Math.max(...score)
    return (
      <div className="card poll" id={'poll-' + p.id}>
        {head}
        {openNow && <small style={{ color: 'var(--mute)', display: 'block' }}>Tippe auf deine Felder: ✓ passt · ? zur Not · ✕ geht nicht</small>}
        <div className="dgrid"><table><thead><tr><th></th>{p.options.map(d => <th key={d}>{fmt(d, { weekday: 'short', day: 'numeric', month: 'numeric' })}</th>)}</tr></thead>
          <tbody>
            <tr><td><b>Du</b></td>{myAns.map((v, i) => <td key={i}><button className={'yn ' + v} disabled={!openNow} aria-label={'Deine Antwort für ' + fmt(p.options[i], { day: 'numeric', month: 'long' })} onClick={() => { const a = [...myAns]; a[i] = cyc[a[i] || '']; save(a.every(x => !x) ? null : a) }}>{lab[v || '']}</button></td>)}</tr>
            {others.map(v => <tr key={v.member_id}><td>{displayName(byId[v.member_id])}</td>{v.answer.map((a, i) => <td key={i}><span className={'yn ' + a} style={{ display: 'inline-grid', placeItems: 'center' }}>{lab[a || '']}</span></td>)}</tr>)}
            <tr className="best"><td>Passt</td>{score.map((s, i) => <td key={i} style={s === best && s > 0 ? { color: 'var(--ok)' } : null}>{s === best && s > 0 ? '★ ' : ''}{s}</td>)}</tr>
          </tbody></table></div>
        <small style={{ color: 'var(--mute)' }}>Punkte: ✓ = 2, ? = 1. Der Stern zeigt den besten Termin.</small>
        {admin}
      </div>
    )
  }

  const tally = p.options.map((_, i) => p.votes.filter(v => v.answer.includes(i)))
  const total = Math.max(1, p.votes.length)
  const max = Math.max(...tally.map(t => t.length))
  const my = mine?.answer || []
  function pick(i) {
    if (!openNow) return
    if (p.kind === 'multi') {
      const a = my.includes(i) ? my.filter(x => x !== i) : [...my, i]
      save(a.length ? a : null)
    } else save(my.includes(i) ? null : [i])
  }
  return (
    <div className="card poll" id={'poll-' + p.id}>
      {head}
      {p.kind === 'multi' && openNow && <small style={{ color: 'var(--mute)', display: 'block' }}>Mehrere Antworten möglich</small>}
      {p.options.map((o, i) => (
        <button key={i} className="opt" aria-pressed={my.includes(i)} disabled={!openNow} onClick={() => pick(i)}>
          <span className="bar" style={{ width: (tally[i].length / total * 100) + '%' }} />
          <span className="lbl">{o}{!openNow && tally[i].length === max && max > 0 ? ' 🏆' : ''}</span>
          <span className="n">{tally[i].length}</span>
        </button>
      ))}
      <button className="linkbtn" onClick={() => setShowWho(!showWho)}>{showWho ? 'Namen ausblenden' : 'Wer hat was gewählt?'}</button>
      {showWho && <div className="who-list">{p.options.map((o, i) => <p key={i}><b>{o}:</b> {tally[i].map(v => displayName(byId[v.member_id])).join(', ') || '–'}</p>)}</div>}
      {admin}
    </div>
  )
}

function PollForm({ onClose, onSaved }) {
  const { me } = useApp()
  const toast = useToast()
  const [kind, setKind] = useState('single')
  const [question, setQuestion] = useState('')
  const [opts, setOpts] = useState('')
  const [dates, setDates] = useState(['', ''])
  const [until, setUntil] = useState('')
  const [push, setPush] = useState(true)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    let options
    if (kind === 'dates') options = [...new Set(dates.filter(Boolean))].sort()
    else if (kind === 'yesno') options = ['Ja', 'Nein']
    else options = opts.split('\n').map(s => s.trim()).filter(Boolean)
    if (options.length < 2) return toast('Mindestens zwei Antworten', kind === 'dates' ? 'Trage mindestens zwei Termine ein.' : 'Eine Antwort pro Zeile.')
    setBusy(true)
    const { data, error } = await supabase.from('polls').insert({
      question: question.trim(), kind: kind === 'yesno' ? 'single' : kind, options, closes_on: until || null, created_by: me.id
    }).select('id').single()
    setBusy(false)
    if (error) return toast('Speichern fehlgeschlagen', error.message)
    if (push) notify('poll_created', { poll_id: data.id })
    toast('Abstimmung gestartet', question)
    onSaved()
  }

  return (
    <Sheet onClose={onClose} label="Abstimmung starten">
      <h1>Abstimmung starten</h1>
      <form className="f" onSubmit={save} style={{ marginTop: 14 }}>
        <label>Frage<input id="poll-q" required value={question} onChange={e => setQuestion(e.target.value)} placeholder="z. B. Wohin geht die Kegelfahrt?" /></label>
        <label>Art<select id="poll-kind" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="single">Umfrage, eine Antwort</option>
          <option value="multi">Umfrage, mehrere Antworten</option>
          <option value="yesno">Ja / Nein</option>
          <option value="dates">Terminfindung</option>
        </select></label>
        {(kind === 'single' || kind === 'multi') && <label>Antworten (eine pro Zeile)<textarea id="poll-opts" rows="4" required value={opts} onChange={e => setOpts(e.target.value)} placeholder={'Hamburg\nDresden\nWien'} /></label>}
        {kind === 'dates' && <div className="f" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--mute)', fontWeight: 600 }}>Termine zur Auswahl</span>
          {dates.map((d, i) => <input key={i} id={'poll-date-' + i} type="date" value={d} onChange={e => { const a = [...dates]; a[i] = e.target.value; setDates(a) }} />)}
          <button type="button" className="btn ghost" onClick={() => setDates([...dates, ''])}>Weiteren Termin hinzufügen</button>
        </div>}
        <label>Abstimmen bis (optional)<input id="poll-until" type="date" value={until} min={iso(today())} onChange={e => setUntil(e.target.value)} /></label>
        <label className="check" style={{ border: 0, color: 'var(--ink)' }}><input type="checkbox" id="poll-push" checked={push} onChange={e => setPush(e.target.checked)} /> Alle per Push benachrichtigen</label>
        <button className="btn" disabled={busy}>{busy ? 'Starte …' : 'Starten'}</button>
      </form>
    </Sheet>
  )
}
