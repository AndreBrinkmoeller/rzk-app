import { today } from './format.js'

export function nextBirthdays(dir) {
  const t = today()
  return dir.filter(m => m.birth_month && m.birth_day).map(m => {
    const n = new Date(t.getFullYear(), m.birth_month - 1, m.birth_day, 12)
    if (n < t) n.setFullYear(n.getFullYear() + 1)
    return { ...m, next: n, age: m.birth_year ? n.getFullYear() - m.birth_year : null, days: Math.round((n - t) / 864e5) }
  }).sort((a, b) => a.next - b.next)
}
