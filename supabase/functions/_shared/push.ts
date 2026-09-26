// Gemeinsame Push-Logik für "notify" und "daily"
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export const DEFAULT_PREFS: Record<string, boolean> = {
  chat: true, chat_mentions_only: false, events: true, reminders: true, polls: true,
  poll_closing: true, birthdays: true, photos: false, ledger: false
}

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
}

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:vergnuegungswart@rzk.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

export type Payload = { title: string; body: string; url?: string; tag?: string }

// Sendet an alle angegebenen Mitglieder, deren Einstellung "pref" aktiv ist.
export async function sendTo(db: SupabaseClient, memberIds: string[], pref: string | null, payload: Payload, filter?: (p: Record<string, boolean>) => boolean) {
  if (!memberIds.length) return { sent: 0 }
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    db.from('push_subscriptions').select('*').in('member_id', memberIds),
    db.from('notification_prefs').select('*').in('member_id', memberIds)
  ])
  const prefBy: Record<string, Record<string, boolean>> = {}
  for (const p of prefs ?? []) prefBy[p.member_id] = p
  let sent = 0
  await Promise.all((subs ?? []).map(async (s: any) => {
    const p = prefBy[s.member_id] ?? DEFAULT_PREFS
    if (pref && !p[pref]) return
    if (filter && !filter(p)) return
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
      sent++
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push failed', e?.statusCode, e?.body)
    }
  }))
  return { sent }
}

export async function activeMembers(db: SupabaseClient) {
  const { data } = await db.from('members').select('id, first_name, nickname, birthday, birthday_visibility').eq('active', true)
  return data ?? []
}

export const nameOf = (m: any) => (m ? m.nickname || m.first_name : 'Jemand')

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
