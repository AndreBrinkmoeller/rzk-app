import { supabase } from './supabase.js'

// Bild verkleinern (lange Kante max. 1600 px) und als JPEG speichern – spart Speicher und Datenvolumen.
export async function compress(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  const src = bmp || await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
  const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s); c.height = Math.round(h * s)
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality))
  return { blob, width: c.width, height: c.height }
}

export async function uploadImage(folder, file) {
  const { blob, width, height } = await compress(file)
  const path = `${folder}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return { path, width, height }
}

const cache = new Map()
export async function signedUrls(paths) {
  const need = paths.filter(p => p && !(cache.has(p) && cache.get(p).exp > Date.now()))
  if (need.length) {
    const { data } = await supabase.storage.from('media').createSignedUrls(need, 60 * 60 * 6)
    ;(data || []).forEach(d => d.signedUrl && cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 1000 * 60 * 60 * 5 }))
  }
  return Object.fromEntries(paths.map(p => [p, cache.get(p)?.url]))
}
