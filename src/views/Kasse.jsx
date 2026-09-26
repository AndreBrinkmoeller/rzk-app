import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { useLive, q, useToast, Loading, ErrorNote, ConfirmButton, Icon } from '../components/ui.jsx'
import { eur, fmt, iso, today } from '../lib/format.js'
import { notify } from '../lib/notify.js'

const CAT = { start: 'Anfangsbestand', dues: 'Beiträge', income: 'Sonstige Einnahme', expense: 'Ausgabe' }

export default function Kasse() {
  const { me } = useApp()
  const toast = useToast()
  const { data, error, reload } = useLive(() => q(supabase.from('ledger').select('*').order('booked_on').order('created_at')), ['ledger'], [])
  const [kind, setKind] = useState('dues')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(iso(today()))
  const [busy, setBusy] = useState(false)
  const [editMode, setEditMode] = useState(false)

  if (!data) return <><h1>Kasse</h1>{error ? <ErrorNote error={error} /> : <Loading />}</>

  const hasStart = data.some(x => x.category === 'start')
  const bal = data.reduce((s, x) => s + Number(x.amount), 0)
  const inc = data.filter(x => x.category !== 'start' && x.amount > 0).reduce((s, x) => s + Number(x.amount), 0)
  const out = data.filter(x => x.amount < 0).reduce((s, x) => s + Number(x.amount), 0)

  let run = 0
  const pts = data.map(x => (run += Number(x.amount)))
  const W = 300, H = 60
  const mx = Math.max(...pts, 0), mn = Math.min(...pts, 0)
  const px = i => pts.length > 1 ? i / (pts.length - 1) * (W - 8) + 4 : W / 2
  const py = v => H - 6 - (v - mn) / ((mx - mn) || 1) * (H - 14)
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')

  const placeholders = { start: 'Anfangsbestand bei Übergabe', dues: `Beiträge ${fmt(today(), { month: 'long' })}`, income: 'z. B. Tombola', expense: 'z. B. Getränke Kloatscheeten' }

  async function book(e) {
    e.preventDefault()
    const a = parseFloat(String(amount).replace(',', '.'))
    if (!(a > 0)) return toast('Betrag fehlt', 'Bitte einen Betrag größer als 0 eingeben.')
    setBusy(true)
    const { error } = await supabase.from('ledger').insert({
      booked_on: date, description: desc.trim() || placeholders[kind], amount: kind === 'expense' ? -a : a, category: kind, created_by: me.id
    })
    setBusy(false)
    if (error) return toast('Nicht gebucht', error.message)
    notify('ledger', { amount: kind === 'expense' ? -a : a, description: desc.trim() || placeholders[kind] })
    toast('Gebucht', (kind === 'expense' ? '− ' : '+ ') + eur(a))
    setDesc(''); setAmount(''); if (kind === 'start') setKind('dues')
    reload()
  }
  async function remove(x) {
    const { error } = await supabase.from('ledger').delete().eq('id', x.id)
    if (error) return toast('Löschen fehlgeschlagen')
    toast('Buchung gelöscht'); reload()
  }

  return (
    <>
      <h1>Kasse</h1>
      <p className="sub">Für alle sichtbar. Gepflegt von den Vergnügungswarten.</p>
      <div className="card balance" style={{ marginTop: 14 }}>
        <div className="eyebrow">Kassenstand</div>
        <div className="big">{eur(bal)}</div>
        {pts.length > 1 && (
          <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Verlauf des Kassenstands">
            <path d={`${line} L${px(pts.length - 1)} ${H} L${px(0)} ${H}Z`} fill="rgba(233,197,139,.18)" />
            <path d={line} fill="none" stroke="#E9C58B" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <circle cx={px(pts.length - 1)} cy={py(pts[pts.length - 1])} r="3.5" fill="#E9C58B" />
          </svg>
        )}
        <div className="split"><div><small>Einnahmen</small><b>+ {eur(inc)}</b></div><div><small>Ausgaben</small><b>− {eur(-out)}</b></div></div>
      </div>

      {me.is_admin && <>
        <h2>Buchung erfassen</h2>
        <form className="card f" onSubmit={book}>
          <div className="seg" role="tablist" style={{ marginTop: 0 }}>
            {(hasStart ? ['dues', 'income', 'expense'] : ['start', 'dues', 'income', 'expense']).map(k => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>{{ start: 'Start', dues: 'Beiträge', income: 'Einnahme', expense: 'Ausgabe' }[k]}</button>
            ))}
          </div>
          <label>Beschreibung<input id="led-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder={placeholders[kind]} /></label>
          <div className="two">
            <label>Betrag in €<input id="led-amount" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></label>
            <label>Datum<input id="led-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Buche …' : 'Buchen'}</button>
        </form>
      </>}

      <h2>Buchungen {me.is_admin && data.length > 0 && <button onClick={() => setEditMode(!editMode)}>{editMode ? 'Fertig' : 'Bearbeiten'}</button>}</h2>
      <div className="list">
        {data.length === 0 && <p className="empty">Noch keine Buchungen.</p>}
        {data.slice().reverse().map(x => (
          <div className="row" key={x.id}>
            <div className="grow"><b>{x.description}</b><small>{fmt(x.booked_on, { day: 'numeric', month: 'long', year: 'numeric' })} · {CAT[x.category]}</small></div>
            <span className={'amt ' + (x.amount < 0 ? 'out' : 'in')}>{x.amount < 0 ? '−' : '+'} {eur(Math.abs(x.amount))}</span>
            {editMode && <ConfirmButton label={<Icon name="trash" size={18} />} confirmLabel="Löschen?" onConfirm={() => remove(x)} className="iconbtn" />}
          </div>
        ))}
      </div>
    </>
  )
}
