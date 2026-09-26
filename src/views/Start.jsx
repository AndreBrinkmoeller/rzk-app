import React from 'react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { useLive, q, Icon, Loading } from '../components/ui.jsx'
import { useEvents, isUpcoming, counts, RsvpButtons } from './Termine.jsx'
import { eur, fmt, today, when, KIND, displayName, time, dayLabel } from '../lib/format.js'
import { nextBirthdays } from '../lib/birthdays.js'

const LANE = '<svg class="lane" viewBox="0 0 160 160" aria-hidden="true"><g fill="currentColor"><circle cx="80" cy="20" r="11"/><circle cx="55" cy="45" r="11"/><circle cx="105" cy="45" r="11"/><circle cx="30" cy="70" r="11"/><circle cx="80" cy="70" r="14"/><circle cx="130" cy="70" r="11"/><circle cx="55" cy="95" r="11"/><circle cx="105" cy="95" r="11"/><circle cx="80" cy="120" r="11"/></g></svg>'

export default function Start() {
  const { me, go, dir, byId, openPolls, unread } = useApp()
  const { data: events, reload } = useEvents()
  const { data: stats } = useLive(async () => {
    const [ledger, photos, albums, msgs] = await Promise.all([
      q(supabase.from('ledger').select('amount')),
      supabase.from('photos').select('id', { count: 'exact', head: true }),
      supabase.from('albums').select('id', { count: 'exact', head: true }),
      q(supabase.from('messages').select('id,member_id,kind,body,image_path,created_at').order('created_at', { ascending: false }).limit(3))
    ])
    return { balance: ledger.reduce((s, x) => s + Number(x.amount), 0), photos: photos.count || 0, albums: albums.count || 0, msgs }
  }, ['ledger', 'photos', 'messages'], [])

  const next = events?.filter(isUpcoming)[0]
  const bd = nextBirthdays(dir)[0]
  const c = next ? counts(next) : null

  return (
    <>
      <h1>Moin {me.nickname || me.first_name}!</h1>
      <p className="sub">Heute ist {fmt(today(), { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
      <h2>Nächster Termin</h2>
      {!events ? <Loading /> : next ? (
        <div className="card hero">
          <span dangerouslySetInnerHTML={{ __html: LANE }} />
          <button className="hero-link" onClick={() => go('termine', { open: next.id })}>
            <div className="eyebrow">{KIND[next.kind]} · {when(next)}</div>
            <h3>{next.title}</h3>
            <div className="meta">{next.start_time && <span>{next.start_time}{next.kind === 'trip' ? '' : ' Uhr'}</span>}{next.location && <span>{next.location}</span>}<span>{c.yes} Zusagen</span></div>
          </button>
          <RsvpButtons e={next} onChange={reload} />
        </div>
      ) : <div className="card"><p className="sub" style={{ margin: 0 }}>Noch kein Termin eingetragen.</p></div>}

      <div className="tiles">
        <button className="tile" onClick={() => go('abstimmen')}><span className="k">Abstimmungen</span><span className="v">{openPolls}</span><span className="h">{openPolls ? 'warten auf deine Stimme' : 'alles abgestimmt'}</span></button>
        <button className="tile" onClick={() => go('kasse')}><span className="k">Kasse</span><span className="v">{stats ? eur(stats.balance).replace(',00', '') : '…'}</span><span className="h">Stand heute</span></button>
        <button className="tile" onClick={() => go('mehr', { sub: 'geburtstage' })}><span className="k">Nächster Geburtstag</span>
          {bd ? <><span className="v" style={{ fontSize: 22 }}>{displayName(bd)}</span><span className="h">{bd.days === 0 ? 'heute!' : fmt(bd.next, { day: 'numeric', month: 'long' })}{bd.age ? ' · wird ' + bd.age : ''}</span></> : <span className="h">noch keine eingetragen</span>}
        </button>
        <button className="tile" onClick={() => go('mehr', { sub: 'fotos' })}><span className="k">Fotos</span><span className="v">{stats ? stats.photos : '…'}</span><span className="h">in {stats ? stats.albums : '…'} Alben</span></button>
      </div>

      <h2>Neu im Chat {unread > 0 && <span className="pill red">{unread} neu</span>}</h2>
      <div className="list feed">
        {stats?.msgs.length === 0 && <p className="empty">Noch keine Nachrichten.</p>}
        {stats?.msgs.map(m => (
          <button key={m.id} className="row" onClick={() => go('chat')}>
            <div className="ico"><Icon name={m.image_path ? 'foto' : 'chat'} size={17} /></div>
            <div className="grow"><b>{displayName(byId[m.member_id])}{m.kind === 'system' ? ' ' + m.body : ': ' + (m.body || 'Foto')}</b><small>{dayLabel(m.created_at)} · {time(m.created_at)}</small></div>
          </button>
        ))}
      </div>
    </>
  )
}
