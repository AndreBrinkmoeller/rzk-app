import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { Icon, useToast, q, Loading } from '../components/ui.jsx'
import { time, dayLabel, displayName } from '../lib/format.js'
import { uploadImage, signedUrls } from '../lib/images.js'
import { notify } from '../lib/notify.js'

const EMOJIS = ['👍', '🍻', '😂', '❤️', '🎳']
const PAGE = 150

export default function Chat() {
  const { me, byId, dir, openLink } = useApp()
  const toast = useToast()
  const [msgs, setMsgs] = useState(null)
  const [reacts, setReacts] = useState({})
  const [urls, setUrls] = useState({})
  const [text, setText] = useState('')
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)
  const stick = useRef(true)

  async function load() {
    const m = await q(supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE))
    m.reverse()
    const ids = m.map(x => x.id)
    const r = ids.length ? await q(supabase.from('message_reactions').select('*').in('message_id', ids)) : []
    const byMsg = {}
    r.forEach(x => ((byMsg[x.message_id] ||= []).push(x)))
    setReacts(byMsg)
    setMsgs(m)
    const paths = m.map(x => x.image_path).filter(Boolean)
    if (paths.length) setUrls(await signedUrls(paths))
  }

  useEffect(() => {
    load()
    let t
    const ch = supabase.channel('chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { clearTimeout(t); t = setTimeout(load, 100) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { clearTimeout(t); t = setTimeout(load, 100) })
      .subscribe()
    const onScroll = () => { stick.current = window.innerHeight + window.scrollY > document.body.scrollHeight - 160 }
    window.addEventListener('scroll', onScroll)
    return () => { supabase.removeChannel(ch); window.removeEventListener('scroll', onScroll); clearTimeout(t) }
  }, [])

  useLayoutEffect(() => { if (msgs && stick.current) window.scrollTo(0, document.body.scrollHeight) }, [msgs, urls])

  const mentionIds = body => {
    const names = (body.match(/@([\wÄÖÜäöüß-]+)/g) || []).map(s => s.slice(1).toLowerCase())
    return dir.filter(m => names.includes((m.nickname || '').toLowerCase()) || names.includes(m.first_name.toLowerCase())).map(m => m.id)
  }

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText(''); stick.current = true
    const { data, error } = await supabase.from('messages').insert({ member_id: me.id, body }).select('id').single()
    if (error) { setText(body); return toast('Nicht gesendet', 'Bitte erneut versuchen.') }
    notify('chat', { message_id: data.id, mentions: mentionIds(body) })
    load()
  }

  async function sendPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); stick.current = true
    try {
      const { path } = await uploadImage('chat', file)
      const { data, error } = await supabase.from('messages').insert({ member_id: me.id, image_path: path, body: text.trim() || null }).select('id').single()
      if (error) throw error
      setText('')
      notify('chat', { message_id: data.id, mentions: [] })
      load()
    } catch (err) {
      toast('Foto nicht gesendet', err.message)
    }
    setBusy(false)
  }

  async function react(m, emoji) {
    const mine = (reacts[m.id] || []).some(r => r.member_id === me.id && r.emoji === emoji)
    const { error } = mine
      ? await supabase.from('message_reactions').delete().match({ message_id: m.id, member_id: me.id, emoji })
      : await supabase.from('message_reactions').insert({ message_id: m.id, member_id: me.id, emoji })
    if (error) toast('Nicht gespeichert')
    setSel(null); load()
  }

  async function remove(m) {
    const { error } = await supabase.from('messages').delete().eq('id', m.id)
    if (error) return toast('Löschen fehlgeschlagen')
    if (m.image_path) await supabase.storage.from('media').remove([m.image_path])
    setSel(null); load()
  }

  if (!msgs) return <><h1>Chat</h1><Loading /></>

  let lastDay = ''
  return (
    <>
      <h1>Chat</h1>
      <p className="sub">Die ganze Truppe, {dir.length} Mitglieder.</p>
      <div className="chat">
        {msgs.length === 0 && <p className="empty">Noch keine Nachrichten. Schreib die erste!</p>}
        {msgs.map(m => {
          const d = dayLabel(m.created_at)
          const day = d !== lastDay ? (lastDay = d, <div className="dayline" key={'d' + m.id}>{d}</div>) : null
          const who = byId[m.member_id]
          if (m.kind === 'system') return <React.Fragment key={m.id}>{day}<button className="sysmsg" onClick={() => openLink(m.link)}><b>{displayName(who)}</b> {m.body}</button></React.Fragment>
          const mine = m.member_id === me.id
          const grouped = {}
          ;(reacts[m.id] || []).forEach(r => { (grouped[r.emoji] ||= []).push(r.member_id) })
          return (
            <React.Fragment key={m.id}>
              {day}
              <div className={'msg' + (mine ? ' me' : '')} onClick={() => setSel(sel === m.id ? null : m.id)}>
                {!mine && <span className="from" style={{ color: who?.color }}>{displayName(who)}</span>}
                {m.image_path && <span className="pic">{urls[m.image_path] ? <a href={urls[m.image_path]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><img src={urls[m.image_path]} alt="Foto" loading="lazy" /></a> : null}</span>}
                {m.body && <p>{renderBody(m.body)}</p>}
                <time>{time(m.created_at)}</time>
                {Object.keys(grouped).length > 0 && (
                  <div className="reacts">
                    {Object.entries(grouped).map(([e, ids]) => (
                      <button key={e} aria-pressed={ids.includes(me.id)} title={ids.map(id => displayName(byId[id])).join(', ')} onClick={ev => { ev.stopPropagation(); react(m, e) }}>{e} {ids.length}</button>
                    ))}
                  </div>
                )}
              </div>
              {sel === m.id && (
                <div className={'msgbar' + (mine ? ' me' : '')}>
                  {EMOJIS.map(e => <button key={e} onClick={() => react(m, e)} aria-label={'Reagieren mit ' + e}>{e}</button>)}
                  {(mine || me.is_admin) && <button onClick={() => remove(m)} aria-label="Nachricht löschen"><Icon name="trash" size={18} /></button>}
                </div>
              )}
            </React.Fragment>
          )
        })}
        {busy && <div className="typing">Foto wird gesendet …</div>}
      </div>
      <div className="composer">
        <form onSubmit={send}>
          <label className="att" aria-label="Foto senden"><Icon name="foto" size={20} /><input type="file" id="chat-photo" accept="image/*" onChange={sendPhoto} /></label>
          <input type="text" id="chat-input" placeholder="Nachricht an alle" autoComplete="off" enterKeyHint="send" value={text} onChange={e => setText(e.target.value)} />
          <button className="send" aria-label="Senden"><Icon name="send" size={20} /></button>
        </form>
      </div>
    </>
  )
}

function renderBody(body) {
  const parts = body.split(/(@[\wÄÖÜäöüß-]+|https?:\/\/\S+)/g)
  return parts.map((p, i) => {
    if (p.startsWith('@')) return <span key={i} className="at">{p}</span>
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{p}</a>
    return p
  })
}
