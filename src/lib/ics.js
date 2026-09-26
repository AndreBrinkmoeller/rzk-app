const pad = n => String(n).padStart(2, '0')
const esc = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n')

export function eventIcs(e) {
  const d = e.starts_on.replace(/-/g, '')
  const m = /^(\d{1,2})[:.](\d{2})/.exec(e.start_time || '')
  let start, end
  if (m && !e.ends_on) {
    const h = +m[1], mi = +m[2]
    start = `DTSTART;TZID=Europe/Berlin:${d}T${pad(h)}${pad(mi)}00`
    end = `DTEND;TZID=Europe/Berlin:${d}T${pad(Math.min(h + 3, 23))}${pad(mi)}00`
  } else {
    const endDate = new Date((e.ends_on || e.starts_on) + 'T12:00:00'); endDate.setDate(endDate.getDate() + 1)
    start = `DTSTART;VALUE=DATE:${d}`
    end = `DTEND;VALUE=DATE:${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}`
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RZK//App//DE', 'BEGIN:VEVENT',
    `UID:${e.id}@rzk-app`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    start, end, `SUMMARY:${esc('RZK: ' + e.title)}`, e.location ? `LOCATION:${esc(e.location)}` : '',
    e.note ? `DESCRIPTION:${esc(e.note)}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n')
}

export function downloadIcs(e) {
  const blob = new Blob([eventIcs(e)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = e.title.replace(/[^\wäöüÄÖÜß -]/g, '') + '.ics'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
