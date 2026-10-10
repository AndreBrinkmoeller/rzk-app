import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { useLive, q, Sheet, useToast, Loading, ErrorNote, ConfirmButton } from '../components/ui.jsx'
import { D, fmt, when, today, iso, KIND, displayName } from '../lib/format.js'
import { notify } from '../lib/notify.js'
import { downloadIcs } from '../lib/ics.js'

export function useEvents() {
  return useLive(async () => {
    const [events, rsvps] = await Promise.all([
      q(supabase.from('events').select('*').order('starts_on').order('start_time')),
      q(supabase.from('rsvps').select('event_id,member_id,status'))
    ])
    const byEvent = {}
    rsvps.forEach(r => { (byEvent[r.event_id] ||= {})[r.member_id] = r.status })
    return events.map(e => ({ ...e, rsvp: byEvent[e.id] || {} }))
  }, ['events', 'rsvps'], [])
}

export const isUpcoming = e => (e.ends_on || e.starts_on) >= iso(today())
export const counts = e => {
  const c = { yes: 0, maybe: 0, no: 0 }
  Object.values(e.rsvp).forEach(v => c[v]++)
  return c
}

export function DateBox({ e }) {
  const d = D(e.starts_on)
  return <div className={'date' + (e.kind === 'trip' ? ' trip' : '')}><b>{d.getDate()}</b><span>{fmt(d, { month: 'short' }).replace('.', '')}</span></div>
}

export function RsvpButtons({ e, onChange }) {
  const { me } = useApp()
  const toast = useToast()
  const mine = e.rsvp[me.id]
  async function set(status) {
    const next = mine === status ? null : status
    const { error } = next
      ? await supabase.from('rsvps').upsert({ event_id: e.id, member_id: me.id, status: next, updated_at: new Date().toISOString() })
      : await supabase.from('rsvps').delete().match({ event_id: e.id, member_id: me.id })
    if (error) return toast('Nicht gespeichert', 'Bitte erneut versuchen.')
    onChange?.()
    if (next) toast(next === 'yes' ? 'Zusage gespeichert' : next === 'no' ? 'Absage gespeichert' : 'Als „Vielleicht“ gespeichert')
  }
  return (
    <div className="rsvp">
      {[['yes', 'Bin dabei'], ['maybe', 'Vielleicht'], ['no', 'Kann nicht']].map(([v, l]) => (
        <button key={v} aria-pressed={mine === v} onClick={() => set(v)}>{l}</button>
      ))}
    </div>
  )
}

function StatusPill({ s }) {
  if (s === 'yes') return <span className="pill ok">Dabei</span>
  if (s === 'no') return <span className="pill">Abgesagt</span>
  if (s === 'maybe') return <span className="pill maple">Vielleicht</span>
  return <span className="pill red">Offen</span>
}


// ── Terminreihen ──
const REPEAT = [
  ['none', 'Nicht wiederholen'],
  ['w1', 'Jede Woche'],
  ['w2', 'Alle 2 Wochen'],
  ['w4', 'Alle 4 Wochen'],
  ['mnth', 'Jeden Monat am gleichen Wochentag'],
  ['mday', 'Jeden Monat am gleichen Datum']
]
const ORD = ['1.', '2.', '3.', '4.', 'letzten']
function seriesDates(startIso, rule, untilIso) {
  const out = []
  const start = D(startIso), until = D(untilIso)
  const wd = start.getDay(), nth = Math.floor((start.getDate() - 1) / 7)
  const lastOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() - start.getDate() < 7 && nth >= 4
  for (let i = 0; i < 120; i++) {
    let d
    if (rule.startsWith('w')) { d = new Date(start); d.setDate(start.getDate() + i * 7 * Number(rule.slice(1))) }
    else if (rule === 'mday') {
      d = new Date(start.getFullYear(), start.getMonth() + i, 1, 12)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(start.getDate(), last))
    } else {
      const first = new Date(start.getFullYear(), start.getMonth() + i, 1, 12)
      const offset = (wd - first.getDay() + 7) % 7
      d = new Date(first); d.setDate(1 + offset + 7 * Math.min(nth, 3))
      if (lastOfMonth || nth >= 4) {
        const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
        d = new Date(last); d.setDate(last.getDate() - ((last.getDay() - wd + 7) % 7))
      }
    }
    if (d > until) break
    out.push(iso(d))
  }
  return out
}
function ruleLabel(rule, startIso) {
  const d = D(startIso), day = fmt(d, { weekday: 'long' })
  if (rule === 'w1') return 'jeden ' + day
  if (rule === 'w2') return 'alle 2 Wochen'
  if (rule === 'w4') return 'alle 4 Wochen'
  if (rule === 'mday') return 'jeden Monat am ' + d.getDate() + '.'
  const nth = Math.floor((d.getDate() - 1) / 7)
  return 'jeden ' + ORD[Math.min(nth, 4)] + ' ' + day + ' im Monat'
}

export default function Termine() {
  const { me, nav } = useApp()
  const { data, error, reload } = useEvents()
  const [open, setOpen] = useState(nav.open)
  const [edit, setEdit] = useState(null)
  const [showPast, setShowPast] = useState(false)
  useEffect(() => setOpen(nav.open), [nav.open])

  if (!data) return <><h1>Termine</h1>{error ? <ErrorNote error={error} /> : <Loading />}</>
  const list = data.filter(e => showPast ? !isUpcoming(e) : isUpcoming(e))
  if (showPast) list.reverse()
  let last = ''
  const current = open && data.find(e => e.id === open)

  return (
    <>
      <h1>Termine</h1>
      <p className="sub">Alle Treffen, Feste und Fahrten auf einen Blick.</p>
      {me.is_admin && <p><button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => setEdit({})}>Termin anlegen</button></p>}
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={!showPast} onClick={() => setShowPast(false)}>Kommende</button>
        <button role="tab" aria-selected={showPast} onClick={() => setShowPast(true)}>Vergangene</button>
      </div>
      <div className="list" style={{ marginTop: 14 }}>
        {list.length === 0 && <p className="empty">{showPast ? 'Noch keine vergangenen Termine.' : 'Noch keine Termine eingetragen.'}</p>}
        {list.map(e => {
          const m = fmt(e.starts_on, { month: 'long', year: 'numeric' })
          const head = m !== last ? (last = m, <div className="month" key={'m' + m}>{m}</div>) : null
          return (
            <React.Fragment key={e.id}>
              {head}
              <button className="row" onClick={() => setOpen(e.id)}>
                <DateBox e={e} />
                <div className="grow"><b>{e.title}</b><small>{e.ends_on ? when(e) : (e.start_time ? e.start_time + ' Uhr' : fmt(e.starts_on, { weekday: 'long' }))}{e.location ? ' · ' + e.location : ''}</small></div>
                {!showPast && <StatusPill s={e.rsvp[me.id]} />}
              </button>
            </React.Fragment>
          )
        })}
      </div>
      {current && <EventSheet e={current} onClose={() => setOpen(null)} onEdit={() => { setEdit(current); setOpen(null) }} reload={reload} />}
      {edit && <EventForm initial={edit} onClose={() => setEdit(null)} onSaved={id => { setEdit(null); reload(); setOpen(id) }} />}
    </>
  )
}

function EventSheet({ e, onClose, onEdit, reload }) {
  const { me, dir } = useApp()
  const toast = useToast()
  const c = counts(e)
  const [packed, setPacked] = useState([])
  useEffect(() => {
    if (e.kind !== 'trip') return
    supabase.from('packing_checks').select('item').eq('event_id', e.id).eq('member_id', me.id)
      .then(({ data }) => setPacked((data || []).map(r => r.item)))
  }, [e.id, e.kind, me.id])

  async function togglePack(i) {
    const has = packed.includes(i)
    setPacked(has ? packed.filter(x => x !== i) : [...packed, i])
    const { error } = has
      ? await supabase.from('packing_checks').delete().match({ event_id: e.id, member_id: me.id, item: i })
      : await supabase.from('packing_checks').insert({ event_id: e.id, member_id: me.id, item: i })
    if (error) toast('Nicht gespeichert')
  }
  async function remove() {
    const { error } = await supabase.from('events').delete().eq('id', e.id)
    if (error) return toast('Löschen fehlgeschlagen', error.message)
    toast('Termin gelöscht'); onClose(); reload()
  }
  async function removeFollowing() {
    const { error } = await supabase.from('events').delete().eq('series_id', e.series_id).gte('starts_on', e.starts_on)
    if (error) return toast('Löschen fehlgeschlagen', error.message)
    toast('Termine gelöscht', 'Dieser und alle folgenden Termine der Reihe'); onClose(); reload()
  }
  const group = s => dir.filter(m => e.rsvp[m.id] === s)
  const none = dir.filter(m => !e.rsvp[m.id])

  return (
    <Sheet onClose={onClose} label={e.title}>
      <div className="eyebrow" style={{ color: 'var(--mute)' }}>{KIND[e.kind]}</div>
      <h1 style={{ marginTop: 6 }}>{e.title}</h1>
      <p className="sub">{when(e)}{e.start_time ? ' · ' + e.start_time + (e.kind === 'trip' ? '' : ' Uhr') : ''}{e.location && <><br />{e.location}</>}</p>
      {e.series_rule && <p className="sub" style={{ marginTop: 4 }}>Wiederholt sich {e.series_rule}.</p>}
      {e.note && <p style={{ whiteSpace: 'pre-wrap' }}>{e.note}</p>}
      {isUpcoming(e) && <div className="card" style={{ marginTop: 12 }}><RsvpButtons e={e} onChange={reload} /></div>}
      <h2>Wer kommt <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>{c.yes} ja · {c.maybe} vielleicht · {c.no} nein</span></h2>
      <div className="who">
        {group('yes').map(m => <span key={m.id} className="pill ok">{displayName(m)}</span>)}
        {group('maybe').map(m => <span key={m.id} className="pill maple">{displayName(m)}</span>)}
        {group('no').map(m => <span key={m.id} className="pill">{displayName(m)}</span>)}
        {none.map(m => <span key={m.id} className="pill" style={{ opacity: .55 }}>{displayName(m)} ?</span>)}
      </div>
      {e.kind === 'trip' && e.program?.length > 0 && <>
        <h2>Programm</h2>
        <div className="list">{e.program.map((p, i) => <div className="row" key={i}><span className="pill maple">{p.day}</span><div className="grow">{p.text}</div></div>)}</div>
      </>}
      {e.cost && <><h2>Kosten</h2><div className="card">{e.cost}</div></>}
      {e.kind === 'trip' && e.packing?.length > 0 && <>
        <h2>Packliste</h2>
        <div className="card" style={{ paddingBlock: 4 }}>
          {e.packing.map((p, i) => (
            <label className="check" key={i} style={i ? null : { borderTop: 0 }}>
              <input type="checkbox" id={`pk-${e.id}-${i}`} checked={packed.includes(i)} onChange={() => togglePack(i)} /> {p}
            </label>
          ))}
        </div>
      </>}
      <p style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => downloadIcs(e)}>In Kalender übernehmen</button>
        {me.is_admin && isUpcoming(e) && <button className="btn ghost" style={{ flex: 1 }} onClick={() => { notify('rsvp_reminder', { event_id: e.id }); toast('Erinnerung an alle Offenen gesendet') }}>Offene erinnern</button>}
      </p>
      {me.is_admin && <p style={{ display: 'flex', gap: 10 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={onEdit}>Bearbeiten</button>
        <ConfirmButton label={e.series_id ? 'Nur diesen löschen' : 'Löschen'} confirmLabel="Wirklich löschen?" onConfirm={remove} className="btn ghost" />
      </p>}
      {me.is_admin && e.series_id && <p style={{ marginTop: 0 }}>
        <ConfirmButton label="Diesen und alle folgenden löschen" confirmLabel="Wirklich alle folgenden löschen?" onConfirm={removeFollowing} className="btn ghost" />
      </p>}
    </Sheet>
  )
}

function EventForm({ initial, onClose, onSaved }) {
  const { me } = useApp()
  const toast = useToast()
  const isNew = !initial.id
  const [f, setF] = useState({
    title: initial.title || '', kind: initial.kind || 'stammtisch', starts_on: initial.starts_on || '', ends_on: initial.ends_on || '',
    start_time: initial.start_time || (isNew ? '19:30' : ''), location: initial.location || '', note: initial.note || '', cost: initial.cost || '',
    program: (initial.program || []).map(p => `${p.day}: ${p.text}`).join('\n'), packing: (initial.packing || []).join('\n'), push: isNew,
    repeat: 'none', until: ''
  })
  const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(ev) {
    ev.preventDefault()
    setBusy(true)
    const row = {
      title: f.title.trim(), kind: f.kind, starts_on: f.starts_on, ends_on: f.ends_on || null,
      start_time: f.start_time || null, location: f.location || null, note: f.note || null, cost: f.cost || null,
      program: f.program.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? { day: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { day: '', text: l } }),
      packing: f.packing.split('\n').map(l => l.trim()).filter(Boolean)
    }
    const series = isNew && f.repeat !== 'none' && f.kind !== 'trip'
    if (series) {
      const until = f.until || iso(new Date(D(f.starts_on).getTime() + 365 * 864e5))
      const dates = seriesDates(f.starts_on, f.repeat, until)
      const series_id = crypto.randomUUID(), series_rule = ruleLabel(f.repeat, f.starts_on)
      const first = await supabase.from('events').insert({ ...row, created_by: me.id, series_id, series_rule }).select('id').single()
      if (first.error) { setBusy(false); return toast('Speichern fehlgeschlagen', first.error.message) }
      const rest = dates.slice(1).map(d => ({ ...row, starts_on: d, ends_on: null, created_by: me.id, series_id, series_rule }))
      const res2 = rest.length ? await supabase.from('events').insert(rest) : { error: null }
      setBusy(false)
      if (res2.error) return toast('Nur der erste Termin wurde gespeichert', res2.error.message)
      if (f.push) notify('event_created', { event_id: first.data.id })
      toast('Terminreihe angelegt', `${dates.length} Termine, ${series_rule}`)
      return onSaved(first.data.id)
    }
    const res = isNew
      ? await supabase.from('events').insert({ ...row, created_by: me.id }).select('id').single()
      : await supabase.from('events').update(row).eq('id', initial.id).select('id').single()
    setBusy(false)
    if (res.error) return toast('Speichern fehlgeschlagen', res.error.message)
    if (isNew && f.push) notify('event_created', { event_id: res.data.id })
    toast(isNew ? 'Termin angelegt' : 'Termin gespeichert', row.title)
    onSaved(res.data.id)
  }

  return (
    <Sheet onClose={onClose} label="Termin">
      <h1>{isNew ? 'Termin anlegen' : 'Termin bearbeiten'}</h1>
      <form className="f" onSubmit={save} style={{ marginTop: 14 }}>
        <label>Titel<input id="ev-title" required value={f.title} onChange={set('title')} placeholder="z. B. Stammtisch" /></label>
        <label>Art<select id="ev-kind" value={f.kind} onChange={set('kind')}><option value="stammtisch">Stammtisch</option><option value="event">Veranstaltung</option><option value="trip">Kegelfahrt</option></select></label>
        <div className="two">
          <label>{f.kind === 'trip' ? 'Von' : 'Datum'}<input id="ev-date" type="date" required value={f.starts_on} onChange={set('starts_on')} /></label>
          {f.kind === 'trip'
            ? <label>Bis<input id="ev-end" type="date" value={f.ends_on} min={f.starts_on} onChange={set('ends_on')} /></label>
            : <label>Uhrzeit<input id="ev-time" type="time" value={f.start_time} onChange={set('start_time')} /></label>}
        </div>
        {f.kind === 'trip' && <label>Abfahrt<input id="ev-dep" value={f.start_time} onChange={set('start_time')} placeholder="z. B. Fr 14:00 am Bahnhof" /></label>}
        {isNew && f.kind !== 'trip' && <>
          <label>Wiederholen<select id="ev-repeat" value={f.repeat} onChange={set('repeat')}>{REPEAT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {f.repeat !== 'none' && f.starts_on && <>
            <label>Bis (leer = ein Jahr)<input id="ev-until" type="date" value={f.until} min={f.starts_on} onChange={set('until')} /></label>
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>{(() => { const n = seriesDates(f.starts_on, f.repeat, f.until || iso(new Date(D(f.starts_on).getTime() + 365 * 864e5))); return `${n.length} Termine, ${ruleLabel(f.repeat, f.starts_on)}: ${n.slice(0, 3).map(d => fmt(d, { day: 'numeric', month: 'short' })).join(', ')}${n.length > 3 ? ' …' : ''}` })()}</p>
          </>}
        </>}
        <label>Ort<input id="ev-loc" value={f.location} onChange={set('location')} /></label>
        <label>Infos<textarea id="ev-note" rows="3" value={f.note} onChange={set('note')} /></label>
        {f.kind !== 'stammtisch' && <label>Kosten<input id="ev-cost" value={f.cost} onChange={set('cost')} placeholder="z. B. ca. 180 € pro Person" /></label>}
        {f.kind === 'trip' && <>
          <label>Programm (eine Zeile pro Punkt, „Tag: Text“)<textarea id="ev-prog" rows="4" value={f.program} onChange={set('program')} placeholder={'Fr: 14:00 Abfahrt\nSa: Stadtführung'} /></label>
          <label>Packliste (ein Punkt pro Zeile)<textarea id="ev-pack" rows="4" value={f.packing} onChange={set('packing')} placeholder={'Personalausweis\nVereinsshirt'} /></label>
        </>}
        {isNew && <label className="check" style={{ border: 0, color: 'var(--ink)' }}><input type="checkbox" id="ev-push" checked={f.push} onChange={set('push')} /> Alle per Push benachrichtigen</label>}
        <button className="btn" disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
      </form>
    </Sheet>
  )
}
