import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, configured } from './lib/supabase.js'
import { Icon, Logo, ToastProvider, useLive, q, Loading } from './components/ui.jsx'
import Login from './views/Login.jsx'
import Privacy from './views/Privacy.jsx'
import Start from './views/Start.jsx'
import Termine from './views/Termine.jsx'
import Chat from './views/Chat.jsx'
import Abstimmen from './views/Abstimmen.jsx'
import Kasse from './views/Kasse.jsx'
import Mehr from './views/Mehr.jsx'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const TABS = [['start', 'Start'], ['termine', 'Termine'], ['chat', 'Chat'], ['abstimmen', 'Abstimmen'], ['kasse', 'Kasse'], ['mehr', 'Mehr']]

export default function App() {
  if (!configured) return <Setup />
  return <ToastProvider><Root /></ToastProvider>
}

function Root() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="app"><Loading /></div>
  if (!session) return <Login />
  return <Member session={session} />
}

function Member({ session }) {
  const { data: me, reload: reloadMe, error } = useLive(async () => {
    const id = await q(supabase.rpc('current_member_id'))
    if (!id) return false
    const rows = await q(supabase.from('members').select('*').eq('id', id))
    return rows[0] || false
  }, [], [session.user.email])

  if (error) return <div className="app"><p className="empty">Verbindung fehlgeschlagen. Bitte später erneut versuchen.</p></div>
  if (me === null) return <div className="app"><Loading /></div>
  if (me === false) return <NotMember email={session.user.email} />
  if (!me.privacy_accepted_at) return <Privacy me={me} onDone={reloadMe} />
  return <Shell me={me} reloadMe={reloadMe} />
}

function Shell({ me, reloadMe }) {
  const [nav, setNav] = useState({ tab: 'start', open: null, sub: null })
  const [unread, setUnread] = useState(0)
  const { data: dir } = useLive(() => q(supabase.from('member_directory').select('*').order('first_name')), ['members'], [])
  const { data: openPolls, reload: reloadPolls } = useLive(async () => {
    const polls = await q(supabase.from('polls').select('id,closes_on,closed'))
    const votes = await q(supabase.from('poll_votes').select('poll_id').eq('member_id', me.id))
    const mine = new Set(votes.map(v => v.poll_id))
    const t = new Date().toISOString().slice(0, 10)
    return polls.filter(p => !p.closed && (!p.closes_on || p.closes_on >= t) && !mine.has(p.id)).length
  }, ['polls', 'poll_votes'], [me.id])

  // Ungelesene Chat-Nachrichten zählen
  useEffect(() => {
    const key = 'rzk-chat-seen'
    const count = async () => {
      let seen = null
      try { seen = localStorage.getItem(key) } catch {}
      if (nav.tab === 'chat') { try { localStorage.setItem(key, new Date().toISOString()) } catch {} ; setUnread(0); return }
      let qb = supabase.from('messages').select('id', { count: 'exact', head: true }).neq('member_id', me.id)
      if (seen) qb = qb.gt('created_at', seen)
      const { count: c } = await qb
      setUnread(c || 0)
    }
    count()
    const ch = supabase.channel('unread').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, count).subscribe()
    return () => supabase.removeChannel(ch)
  }, [nav.tab, me.id])

  const byId = useMemo(() => Object.fromEntries((dir || []).map(m => [m.id, m])), [dir])
  const go = useCallback((tab, extra = {}) => { setNav({ tab, open: null, sub: null, ...extra }); if (tab !== 'chat') window.scrollTo(0, 0) }, [])
  const openLink = useCallback(link => {
    if (!link) return
    const [type, id] = link.split(':')
    if (type === 'event') go('termine', { open: id })
    if (type === 'poll') go('abstimmen', { open: id })
  }, [go])

  // Push-Klick: "/?go=chat" oder "/?link=event:<id>"
  useEffect(() => {
    const handle = url => {
      const p = new URL(url, location.origin).searchParams
      if (p.get('link')) openLink(p.get('link'))
      else if (p.get('go')) go(p.get('go'), p.get('sub') ? { sub: p.get('sub') } : {})
    }
    if (location.search) { handle(location.href); history.replaceState(null, '', '/') }
    const onMsg = e => e.data?.type === 'open' && handle(e.data.url)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [go, openLink])

  const ctx = { me, reloadMe, dir: dir || [], byId, nav, go, openLink, openPolls: openPolls || 0, reloadPolls, unread }
  const View = { start: Start, termine: Termine, chat: Chat, abstimmen: Abstimmen, kasse: Kasse, mehr: Mehr }[nav.tab]

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="top">
          <Logo />
          <button className="bell" onClick={() => go('mehr', { sub: 'push' })} aria-label="Benachrichtigungen">
            <Icon name="bell" size={20} />
          </button>
        </header>
        <main><View /></main>
      </div>
      <nav className="tabs" aria-label="Hauptmenü">
        <div className="in">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => go(k)} aria-current={nav.tab === k ? 'page' : undefined}>
              <Icon name={k} /><span>{l}</span>
              {k === 'abstimmen' && openPolls > 0 && <span className="dot">{openPolls}</span>}
              {k === 'chat' && unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
            </button>
          ))}
        </div>
      </nav>
    </Ctx.Provider>
  )
}

function NotMember({ email }) {
  return (
    <div className="app">
      <header className="top"><Logo /></header>
      <h1>Noch nicht freigeschaltet</h1>
      <p className="sub">Die Adresse {email} ist nicht als Mitglied eingetragen. Sag Andre Bescheid, dann schaltet er dich frei.</p>
      <p><button className="btn ghost" onClick={() => supabase.auth.signOut()}>Mit anderer Adresse anmelden</button></p>
    </div>
  )
}

function Setup() {
  return (
    <div className="app">
      <header className="top"><Logo /></header>
      <h1>Fast startklar</h1>
      <p className="sub">Die Verbindung zur Datenbank fehlt noch. Trage VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ein (siehe README).</p>
    </div>
  )
}
