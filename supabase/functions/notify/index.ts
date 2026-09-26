// Wird von der App nach einer Aktion aufgerufen und verschickt Push-Nachrichten an die anderen Mitglieder.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, sendTo, activeMembers, nameOf, json, cors } from '../_shared/push.ts'

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // Absender über sein Login bestimmen
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false }
    })
    const { data: senderId } = await userDb.rpc('current_member_id')
    if (!senderId) return json({ error: 'not a member' }, 403)

    const db = admin()
    const body = await req.json()
    const members = await activeMembers(db)
    const sender = members.find(m => m.id === senderId)
    const { data: senderRow } = await db.from('members').select('is_admin').eq('id', senderId).single()
    const others = members.filter(m => m.id !== senderId).map(m => m.id)
    const who = nameOf(sender)

    switch (body.type) {
      case 'test':
        return json(await sendTo(db, [senderId], null, { title: 'Test erfolgreich 🎳', body: 'So sehen Benachrichtigungen vom RZK aus.', url: '/?go=mehr&sub=push' }))

      case 'chat': {
        const { data: msg } = await db.from('messages').select('*').eq('id', body.message_id).single()
        if (!msg || msg.member_id !== senderId) return json({ error: 'message not found' }, 404)
        const mentions: string[] = Array.isArray(body.mentions) ? body.mentions : []
        const text = msg.body ? String(msg.body).slice(0, 140) : '📷 Foto'
        return json(await sendTo(db, others, 'chat',
          { title: who, body: text, url: '/?go=chat', tag: 'chat' },
          p => !p.chat_mentions_only).then(async r => {
            // Erwähnte bekommen die Nachricht auch, wenn sie "nur Erwähnungen" gewählt haben
            const mentioned = mentions.filter(id => others.includes(id))
            const r2 = await sendTo(db, mentioned, 'chat', { title: `${who} hat dich erwähnt`, body: text, url: '/?go=chat', tag: 'chat' }, p => !!p.chat_mentions_only)
            return { sent: r.sent + r2.sent }
          }))
      }

      case 'event_created': {
        if (!senderRow?.is_admin) return json({ error: 'forbidden' }, 403)
        const { data: e } = await db.from('events').select('*').eq('id', body.event_id).single()
        if (!e) return json({ error: 'not found' }, 404)
        return json(await sendTo(db, others, 'events', { title: 'Neuer Termin: ' + e.title, body: fmtDate(e.starts_on) + (e.location ? ' · ' + e.location : '') + ' – bist du dabei?', url: '/?link=event:' + e.id }))
      }

      case 'rsvp_reminder': {
        if (!senderRow?.is_admin) return json({ error: 'forbidden' }, 403)
        const { data: e } = await db.from('events').select('*').eq('id', body.event_id).single()
        if (!e) return json({ error: 'not found' }, 404)
        const { data: r } = await db.from('rsvps').select('member_id').eq('event_id', e.id)
        const answered = new Set((r ?? []).map((x: any) => x.member_id))
        const open = members.map(m => m.id).filter(id => !answered.has(id) && id !== senderId)
        return json(await sendTo(db, open, null, { title: 'Kommst du mit?', body: `${e.title} am ${fmtDate(e.starts_on)} – bitte kurz zu- oder absagen.`, url: '/?link=event:' + e.id }))
      }

      case 'poll_created': {
        if (!senderRow?.is_admin) return json({ error: 'forbidden' }, 403)
        const { data: p } = await db.from('polls').select('*').eq('id', body.poll_id).single()
        if (!p) return json({ error: 'not found' }, 404)
        return json(await sendTo(db, others, 'polls', { title: 'Neue Abstimmung', body: p.question, url: '/?link=poll:' + p.id }))
      }

      case 'photos': {
        const { data: a } = await db.from('albums').select('title').eq('id', body.album_id).single()
        const n = Number(body.count) || 1
        return json(await sendTo(db, others, 'photos', { title: 'Neue Fotos', body: `${who} hat ${n} Foto${n > 1 ? 's' : ''} in „${a?.title ?? 'Album'}“ hochgeladen.`, url: '/?go=mehr&sub=fotos', tag: 'photos' }))
      }

      case 'ledger': {
        if (!senderRow?.is_admin) return json({ error: 'forbidden' }, 403)
        const a = Number(body.amount) || 0
        return json(await sendTo(db, others, 'ledger', { title: 'Kasse: ' + (a < 0 ? 'Ausgabe' : 'Einnahme'), body: `${String(body.description ?? '').slice(0, 80)} (${a < 0 ? '−' : '+'} ${eur(Math.abs(a))})`, url: '/?go=kasse' }))
      }

      default:
        return json({ error: 'unknown type' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
