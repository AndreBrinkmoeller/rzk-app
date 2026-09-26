export const D = s => new Date(s + 'T12:00:00')
export const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fmt = (d, o) => (typeof d === 'string' ? D(d) : d).toLocaleDateString('de-DE', o)
export const eur = n => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
export const time = ts => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
export function when(e) {
  let s = fmt(e.starts_on, { weekday: 'short', day: 'numeric', month: 'long' })
  if (e.ends_on && e.ends_on !== e.starts_on) s += ' – ' + fmt(e.ends_on, { weekday: 'short', day: 'numeric', month: 'long' })
  return s
}
export function dayLabel(ts) {
  const d = new Date(ts), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1)
  if (d.toDateString() === t.toDateString()) return 'Heute'
  if (d.toDateString() === y.toDateString()) return 'Gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}
export const displayName = m => (m ? m.nickname || m.first_name : 'Ehemaliges Mitglied')
export const KIND = { stammtisch: 'Stammtisch', event: 'Veranstaltung', trip: 'Kegelfahrt' }
