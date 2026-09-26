import { supabase } from './supabase.js'

// Push an andere Mitglieder auslösen. Fehler blockieren nie die eigentliche Aktion.
export async function notify(type, payload = {}) {
  try {
    await supabase.functions.invoke('notify', { body: { type, ...payload } })
  } catch (e) {
    console.warn('Push nicht gesendet', e)
  }
}
