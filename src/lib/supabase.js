import { createClient } from '@supabase/supabase-js'

// Öffentliche Verbindungsdaten (dürfen im Code stehen – geschützt wird über die Zugriffsregeln in der Datenbank).
const DEFAULT_URL = 'https://orcqtwckijudgczffvyn.supabase.co'
const DEFAULT_KEY = 'sb_publishable_7bTbuU0refvSaMcezp7yig_fPsQktiw'

const envUrl = import.meta.env.VITE_SUPABASE_URL
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const valid = v => typeof v === 'string' && v.length > 20 && !/DEIN|dein-/.test(v)

const url = valid(envUrl) ? envUrl : DEFAULT_URL
const key = valid(envKey) ? envKey : DEFAULT_KEY

export const configured = Boolean(url && key)
export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
