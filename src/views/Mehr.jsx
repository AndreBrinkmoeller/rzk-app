import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { useLive, q, Sheet, useToast, Loading, Avatar, Icon, ConfirmButton } from '../components/ui.jsx'
import { fmt, displayName } from '../lib/format.js'
import { nextBirthdays } from '../lib/birthdays.js'
import { uploadImage, signedUrls } from '../lib/images.js'
import { notify } from '../lib/notify.js'
import { enablePush, disablePush, currentSubscription, pushSupported, isIOS, isStandalone } from '../lib/push.js'
import { PrivacyText } from './Privacy.jsx'

const SEGS = [['fotos', 'Fotos'], ['geburtstage', 'Geburtstage'], ['mitglieder', 'Mitglieder'], ['profil', 'Profil'], ['push', 'Push']]

export default function Mehr() {
  const { nav } = useApp()
  const [sub, setSub] = useState(nav.sub || 'fotos')
  useEffect(() => { if (nav.sub) setSub(nav.sub) }, [nav.sub])
  return (
    <>
      <h1>Mehr</h1>
      <div className="seg scroll" role="tablist">
        {SEGS.map(([k, l]) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}>{l}</button>)}
      </div>
      {sub === 'fotos' && <Fotos />}
      {sub === 'geburtstage' && <Geburtstage />}
      {sub === 'mitglieder' && <Mitglieder />}
      {sub === 'profil' && <Profil />}
      {sub === 'push' && <Push />}
    </>
  )
}

/* ───────────── Fotos ───────────── */
function Fotos() {
  const { me } = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const { data, reload } = useLive(async () => {
    const [albums, photos] = await Promise.all([
      q(supabase.from('albums').select('*').order('created_at', { ascending: false })),
      q(supabase.from('photos').select('id,album_id,path,created_at').order('created_at', { ascending: false }))
    ])
    const covers = albums.map(a => photos.find(p => p.album_id === a.id)?.path).filter(Boolean)
    const urls = covers.length ? await signedUrls(covers) : {}
    return albums.map(a => {
      const ps = photos.filter(p => p.album_id === a.id)
      return { ...a, count: ps.length, cover: ps[0] ? urls[ps[0].path] : null }
    })
  }, ['albums', 'photos'], [])

  async function create(e) {
    e.preventDefault()
    const { data: row, error } = await supabase.from('albums').insert({ title: newTitle.trim(), created_by: me.id }).select('*').single()
    if (error) return toast('Album nicht angelegt', error.message)
    setNewTitle(''); setAdding(false); reload(); setOpen(row.id)
  }

  if (!data) return <Loading />
  const album = open && data.find(a => a.id === open)
  return (
    <>
      <h2>Fotoalben <button onClick={() => setAdding(!adding)}>{adding ? 'Abbrechen' : 'Neues Album'}</button></h2>
      {adding && <form className="card f" onSubmit={create} style={{ marginBottom: 12 }}>
        <label>Name des Albums<input id="album-title" required value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="z. B. Kegelfahrt 2027" /></label>
        <button className="btn">Anlegen</button>
      </form>}
      {data.length === 0 && !adding && <p className="empty">Noch keine Alben. Leg das erste an!</p>}
      <div className="albums">
        {data.map(a => (
          <button key={a.id} className="album" onClick={() => setOpen(a.id)}>
            <span className="cov">{a.cover ? <img src={a.cover} alt="" loading="lazy" /> : <span className="cov-empty"><Icon name="foto" size={32} /></span>}</span>
            <b>{a.title}</b><small>{a.count} Fotos</small>
          </button>
        ))}
      </div>
      {album && <AlbumSheet album={album} onClose={() => setOpen(null)} reloadAlbums={reload} />}
    </>
  )
}

function AlbumSheet({ album, onClose, reloadAlbums }) {
  const { me, byId } = useApp()
  const toast = useToast()
  const [progress, setProgress] = useState(null)
  const [view, setView] = useState(null)
  const { data, reload } = useLive(async () => {
    const photos = await q(supabase.from('photos').select('*').eq('album_id', album.id).order('created_at', { ascending: false }))
    const urls = photos.length ? await signedUrls(photos.map(p => p.path)) : {}
    return photos.map(p => ({ ...p, url: urls[p.path] }))
  }, ['photos'], [album.id])

  async function upload(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    let done = 0, failed = 0
    setProgress(`0 von ${files.length}`)
    for (const f of files) {
      try {
        const { path, width, height } = await uploadImage('fotos/' + album.id, f)
        const { error } = await supabase.from('photos').insert({ album_id: album.id, path, width, height, uploaded_by: me.id })
        if (error) throw error
      } catch { failed++ }
      done++; setProgress(`${done} von ${files.length}`)
    }
    setProgress(null); reload(); reloadAlbums()
    const ok = files.length - failed
    if (ok) notify('photos', { album_id: album.id, count: ok })
    toast(failed ? `${ok} hochgeladen, ${failed} fehlgeschlagen` : `${ok} Foto${ok > 1 ? 's' : ''} hochgeladen`, album.title)
  }
  async function removePhoto(p) {
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (error) return toast('Löschen fehlgeschlagen')
    await supabase.storage.from('media').remove([p.path])
    setView(null); reload(); reloadAlbums()
  }
  async function removeAlbum() {
    const paths = (data || []).map(p => p.path)
    const { error } = await supabase.from('albums').delete().eq('id', album.id)
    if (error) return toast('Löschen fehlgeschlagen')
    if (paths.length) await supabase.storage.from('media').remove(paths)
    toast('Album gelöscht'); onClose(); reloadAlbums()
  }

  const idx = view ? data.findIndex(p => p.id === view) : -1
  const cur = idx >= 0 ? data[idx] : null
  return (
    <Sheet onClose={onClose} label={album.title}>
      <h1>{album.title}</h1>
      <p className="sub">{data ? data.length : '…'} Fotos</p>
      <label className="upload" style={{ marginTop: 12 }}><Icon name="foto" size={20} /> {progress ? `Lade hoch … ${progress}` : 'Fotos hochladen'}
        <input type="file" id="album-upload" accept="image/*" multiple onChange={upload} disabled={!!progress} />
      </label>
      {!data ? <Loading /> : (
        <div className="photos">
          {data.map(p => <button key={p.id} className="ph" onClick={() => setView(p.id)}>{p.url && <img src={p.url} alt="" loading="lazy" />}</button>)}
        </div>
      )}
      {(me.is_admin || album.created_by === me.id) && <p style={{ marginTop: 16 }}><ConfirmButton label="Album löschen" confirmLabel="Album mit allen Fotos löschen?" onConfirm={removeAlbum} /></p>}
      {cur && (
        <div className="lightbox" onClick={e => e.target === e.currentTarget && setView(null)}>
          <img src={cur.url} alt="" />
          <div className="lb-bar">
            <button onClick={() => setView(data[(idx - 1 + data.length) % data.length].id)} aria-label="Vorheriges Foto">‹</button>
            <span>{displayName(byId[cur.uploaded_by])} · {fmt(cur.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</span>
            <a href={cur.url} target="_blank" rel="noreferrer">Original</a>
            {(cur.uploaded_by === me.id || me.is_admin) && <ConfirmButton label="Löschen" confirmLabel="Wirklich?" onConfirm={() => removePhoto(cur)} className="lb-del" />}
            <button onClick={() => setView(data[(idx + 1) % data.length].id)} aria-label="Nächstes Foto">›</button>
            <button onClick={() => setView(null)} aria-label="Schließen">✕</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ───────────── Geburtstage ───────────── */
function Geburtstage() {
  const { dir } = useApp()
  const list = nextBirthdays(dir)
  return (
    <>
      <h2>Nächste Geburtstage</h2>
      <div className="list">
        {list.length === 0 && <p className="empty">Noch keine Geburtstage eingetragen.</p>}
        {list.map(m => (
          <div className="row" key={m.id}>
            <Avatar m={m} />
            <div className="grow"><b>{displayName(m)}</b><small>{fmt(m.next, { weekday: 'long', day: 'numeric', month: 'long' })}{m.age ? ' · wird ' + m.age : ''}</small></div>
            {m.days === 0 ? <span className="pill red">Heute!</span> : m.days <= 30 ? <span className="pill red">in {m.days} Tagen</span> : <span className="pill">{m.days} Tage</span>}
          </div>
        ))}
      </div>
      <p className="sub" style={{ fontSize: 13, marginTop: 10 }}>Am Geburtstag kommt morgens eine Push-Erinnerung an alle.</p>
    </>
  )
}

/* ───────────── Mitglieder ───────────── */
function Mitglieder() {
  const { me, dir } = useApp()
  const [edit, setEdit] = useState(null)
  return (
    <>
      <h2>{dir.length} Mitglieder {me.is_admin && <button onClick={() => setEdit({})}>Mitglied hinzufügen</button>}</h2>
      <div className="list">
        {dir.map(m => (
          <button className="row" key={m.id} onClick={() => me.is_admin && setEdit(m)} style={me.is_admin ? null : { cursor: 'default' }}>
            <Avatar m={m} />
            <div className="grow"><b>{m.first_name} {m.last_name}{m.nickname ? ` („${m.nickname}“)` : ''}{m.id === me.id ? ' (du)' : ''}</b>
              <small>{m.title || 'Mitglied'}{m.phone ? ' · ' + m.phone : ''}</small></div>
            {m.is_admin && <span className="pill maple">Admin</span>}
          </button>
        ))}
      </div>
      {edit && <MemberForm id={edit.id} onClose={() => setEdit(null)} />}
    </>
  )
}

const COLORS = ['#B6423A', '#4F5C76', '#2E7D4F', '#8A5A12', '#5B4B8A', '#1F6F8B', '#9C3D6B', '#4F6B2A', '#B0472A', '#3C4A7A', '#6B4A1E', '#2F6F6A']

function MemberForm({ id, onClose }) {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!id) return setF({ first_name: '', last_name: '', nickname: '', email: '', phone: '', birthday: '', birthday_visibility: 'with_age', title: '', is_admin: false, active: true, color: COLORS[Math.floor(Math.random() * COLORS.length)] })
    supabase.from('members').select('*').eq('id', id).single().then(({ data }) => setF({ ...data, birthday: data.birthday || '', nickname: data.nickname || '', phone: data.phone || '', last_name: data.last_name || '', title: data.title || '' }))
  }, [id])
  if (!f) return <Sheet onClose={onClose}><Loading /></Sheet>
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const row = {
      first_name: f.first_name.trim(), last_name: f.last_name.trim() || null, nickname: f.nickname.trim() || null, email: f.email.trim().toLowerCase(),
      phone: f.phone.trim() || null, birthday: f.birthday || null, birthday_visibility: f.birthday_visibility, title: f.title.trim() || null,
      is_admin: f.is_admin, active: f.active, color: f.color
    }
    const { error } = id ? await supabase.from('members').update(row).eq('id', id) : await supabase.from('members').insert(row)
    setBusy(false)
    if (error) return toast('Nicht gespeichert', error.code === '23505' ? 'Diese E-Mail-Adresse ist schon eingetragen.' : error.message)
    toast(id ? 'Gespeichert' : 'Mitglied hinzugefügt', id ? '' : 'Er kann sich jetzt mit seiner E-Mail-Adresse anmelden.')
    onClose()
  }

  return (
    <Sheet onClose={onClose} label="Mitglied">
      <h1>{id ? 'Mitglied bearbeiten' : 'Mitglied hinzufügen'}</h1>
      <form className="f" onSubmit={save} style={{ marginTop: 14 }}>
        <div className="two"><label>Vorname<input id="m-first" required value={f.first_name} onChange={set('first_name')} /></label><label>Nachname<input id="m-last" value={f.last_name} onChange={set('last_name')} /></label></div>
        <label>Spitzname (so heißt er in der App)<input id="m-nick" value={f.nickname} onChange={set('nickname')} /></label>
        <label>E-Mail-Adresse (für den Login)<input id="m-email" type="email" required value={f.email} onChange={set('email')} /></label>
        <div className="two"><label>Handy<input id="m-phone" type="tel" value={f.phone} onChange={set('phone')} /></label><label>Geburtstag<input id="m-bday" type="date" value={f.birthday} onChange={set('birthday')} /></label></div>
        <label>Geburtstag anzeigen<select id="m-bvis" value={f.birthday_visibility} onChange={set('birthday_visibility')}><option value="with_age">Ja, mit Alter</option><option value="no_age">Ja, ohne Alter</option><option value="hidden">Nein</option></select></label>
        <label>Amt (optional)<input id="m-title" value={f.title} onChange={set('title')} placeholder="z. B. Vergnügungswart" /></label>
        <label className="check" style={{ border: 0, color: 'var(--ink)' }}><input type="checkbox" id="m-admin" checked={f.is_admin} onChange={set('is_admin')} /> Admin (darf Termine, Abstimmungen, Kasse und Mitglieder pflegen)</label>
        {id && <label className="check" style={{ border: 0, color: 'var(--ink)' }}><input type="checkbox" id="m-active" checked={f.active} onChange={set('active')} /> Aktives Mitglied (ohne Haken: kein Zugang mehr)</label>}
        <div><span style={{ fontSize: 13, color: 'var(--mute)', fontWeight: 600 }}>Farbe</span>
          <div className="colors">{COLORS.map(c => <button type="button" key={c} style={{ background: c }} aria-pressed={f.color === c} aria-label={'Farbe ' + c} onClick={() => setF({ ...f, color: c })} />)}</div></div>
        <button className="btn" disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
      </form>
    </Sheet>
  )
}

/* ───────────── Profil ───────────── */
function Profil() {
  const { me, reloadMe } = useApp()
  const toast = useToast()
  const [f, setF] = useState({ nickname: me.nickname || '', phone: me.phone || '', birthday: me.birthday || '', birthday_visibility: me.birthday_visibility })
  const [showPrivacy, setShowPrivacy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('members').update({ nickname: f.nickname.trim() || null, phone: f.phone.trim() || null, birthday: f.birthday || null, birthday_visibility: f.birthday_visibility }).eq('id', me.id)
    if (error) return toast('Nicht gespeichert', error.message)
    toast('Profil gespeichert'); reloadMe()
  }
  return (
    <>
      <h2>Mein Profil</h2>
      <form className="card f" onSubmit={save}>
        <p style={{ margin: 0 }}><b>{me.first_name} {me.last_name}</b><br /><small style={{ color: 'var(--mute)' }}>{me.email}</small></p>
        <label>Spitzname<input id="p-nick" value={f.nickname} onChange={set('nickname')} placeholder={me.first_name} /></label>
        <label>Handy<input id="p-phone" type="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Geburtstag<input id="p-bday" type="date" value={f.birthday} onChange={set('birthday')} /></label>
        <label>Geburtstag anzeigen<select id="p-bvis" value={f.birthday_visibility} onChange={set('birthday_visibility')}><option value="with_age">Ja, mit Alter</option><option value="no_age">Ja, ohne Alter</option><option value="hidden">Nein</option></select></label>
        <button className="btn">Speichern</button>
      </form>
      <p style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <button className="btn ghost" onClick={() => setShowPrivacy(true)}>Datenschutzhinweis</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </p>
      {showPrivacy && <Sheet onClose={() => setShowPrivacy(false)} label="Datenschutz"><h1>Datenschutz</h1><PrivacyText /></Sheet>}
    </>
  )
}

/* ───────────── Push ───────────── */
const PREFS = [
  ['chat', 'Chat-Nachrichten'], ['chat_mentions_only', 'Chat: nur wenn ich erwähnt werde'], ['events', 'Neue Termine'], ['reminders', 'Erinnerung am Vortag'],
  ['polls', 'Neue Abstimmung'], ['poll_closing', 'Abstimmung endet bald'], ['birthdays', 'Geburtstage'], ['photos', 'Neue Fotos'], ['ledger', 'Kassenbuchungen']
]
const DEFAULTS = { chat: true, chat_mentions_only: false, events: true, reminders: true, polls: true, poll_closing: true, birthdays: true, photos: false, ledger: false }

function Push() {
  const { me } = useApp()
  const toast = useToast()
  const [prefs, setPrefs] = useState(null)
  const [sub, setSub] = useState(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('notification_prefs').select('*').eq('member_id', me.id).maybeSingle().then(({ data }) => setPrefs(data || { member_id: me.id, ...DEFAULTS }))
    currentSubscription().then(setSub).catch(() => setSub(null))
  }, [me.id])

  async function toggle(k) {
    const next = { ...prefs, [k]: !prefs[k] }
    setPrefs(next)
    const { error } = await supabase.from('notification_prefs').upsert(next)
    if (error) { setPrefs(prefs); toast('Nicht gespeichert') }
  }
  async function on() {
    setBusy(true)
    try {
      setSub(await enablePush(me.id))
      if (!prefs.member_id || !(await supabase.from('notification_prefs').select('member_id').eq('member_id', me.id).maybeSingle()).data) await supabase.from('notification_prefs').upsert(prefs)
      toast('Benachrichtigungen aktiv')
    } catch (e) { toast('Nicht aktiviert', e.message) }
    setBusy(false)
  }
  async function off() { setBusy(true); await disablePush(); setSub(null); setBusy(false); toast('Benachrichtigungen auf diesem Gerät aus') }

  const needsInstall = isIOS() && !isStandalone()
  return (
    <>
      <h2>Auf diesem Gerät</h2>
      <div className="card">
        {needsInstall ? (
          <div className="prose">
            <p><b>Erst die App installieren:</b> Auf dem iPhone kommen Push-Nachrichten nur an, wenn die App auf dem Home-Bildschirm liegt.</p>
            <p>1. Unten in Safari auf <b>Teilen</b> tippen (Quadrat mit Pfeil).<br />2. <b>Zum Home-Bildschirm</b> wählen.<br />3. Die App über das neue RZK-Symbol öffnen und hier Push einschalten.</p>
          </div>
        ) : !pushSupported() ? (
          <p className="sub" style={{ margin: 0 }}>Dieser Browser unterstützt keine Push-Nachrichten. Öffne die App in Chrome, Safari oder Edge.</p>
        ) : sub ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}><span className="pill ok">Aktiv</span> Push-Nachrichten kommen auf diesem Gerät an.</p>
            <button className="btn ghost" onClick={() => notify('test').then(() => toast('Test gesendet', 'Die Nachricht sollte gleich erscheinen.'))}>Test-Benachrichtigung senden</button>
            <button className="btn ghost" onClick={off} disabled={busy}>Auf diesem Gerät ausschalten</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}>Schalte Push ein, damit du Termine, Abstimmungen und Chat-Nachrichten nicht verpasst.</p>
            <button className="btn" onClick={on} disabled={busy || sub === undefined}>Push einschalten</button>
          </div>
        )}
      </div>
      <h2>Worüber willst du informiert werden?</h2>
      {!prefs ? <Loading /> : (
        <div className="card" style={{ paddingBlock: 4 }}>
          {PREFS.map(([k, l], i) => (
            <label className="check" key={k} style={{ justifyContent: 'space-between', ...(i ? {} : { borderTop: 0 }), ...(k === 'chat_mentions_only' && !prefs.chat ? { opacity: .45 } : {}) }}>
              <span>{l}</span><input type="checkbox" className="toggle" id={'pref-' + k} checked={!!prefs[k]} disabled={k === 'chat_mentions_only' && !prefs.chat} onChange={() => toggle(k)} />
            </label>
          ))}
        </div>
      )}
    </>
  )
}
