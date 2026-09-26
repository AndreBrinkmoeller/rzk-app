// Läuft einmal täglich (GitHub Action): Termin-Erinnerungen, Geburtstage, Abstimmungen kurz vor Ende.
import { admin, sendTo, activeMembers, nameOf, json } from '../_shared/push.ts'

const berlinDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d) // YYYY-MM-DD
}

Deno.serve(async req => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403)
  const db = admin()
  const members = await activeMembers(db)
  const all = members.map(m => m.id)
  const today = berlinDate(0), tomorrow = berlinDate(1)
  const out: Record<string, number> = {}

  // 1) Termine morgen: alle außer Absagern
  const { data: events } = await db.from('events').select('*').eq('starts_on', tomorrow)
  for (const e of events ?? []) {
    const { data: r } = await db.from('rsvps').select('member_id,status').eq('event_id', e.id)
    const no = new Set((r ?? []).filter((x: any) => x.status === 'no').map((x: any) => x.member_id))
    const res = await sendTo(db, all.filter(id => !no.has(id)), 'reminders', {
      title: 'Morgen: ' + e.title, body: [e.start_time && e.start_time + (e.kind === 'trip' ? '' : ' Uhr'), e.location].filter(Boolean).join(' · ') || 'Nicht vergessen!', url: '/?link=event:' + e.id
    })
    out['event_' + e.id] = res.sent
  }

  // 2) Geburtstage heute
  const [, mm, dd] = today.split('-')
  for (const m of members) {
    if (!m.birthday || m.birthday_visibility === 'hidden') continue
    const [y, bm, bd] = m.birthday.split('-')
    if (bm !== mm || bd !== dd) continue
    const age = m.birthday_visibility === 'with_age' ? Number(today.slice(0, 4)) - Number(y) : null
    const res = await sendTo(db, all.filter(id => id !== m.id), 'birthdays', {
      title: '🎉 ' + nameOf(m) + ' hat Geburtstag', body: age ? `${nameOf(m)} wird heute ${age}. Gratulieren nicht vergessen!` : 'Gratulieren nicht vergessen!', url: '/?go=chat'
    })
    out['bday_' + m.id] = res.sent
  }

  // 3) Abstimmungen, die morgen enden: nur an die, die noch nicht abgestimmt haben
  const { data: polls } = await db.from('polls').select('*').eq('closes_on', tomorrow).eq('closed', false)
  for (const p of polls ?? []) {
    const { data: v } = await db.from('poll_votes').select('member_id').eq('poll_id', p.id)
    const voted = new Set((v ?? []).map((x: any) => x.member_id))
    const res = await sendTo(db, all.filter(id => !voted.has(id)), 'poll_closing', { title: 'Abstimmung endet morgen', body: p.question, url: '/?link=poll:' + p.id })
    out['poll_' + p.id] = res.sent
  }

  return json({ today, ...out })
})
