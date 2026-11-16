import {useEffect, useState} from 'react'
import {initializeApp, getApps} from 'firebase/app'
import {initializeAppCheck, ReCaptchaEnterpriseProvider} from 'firebase/app-check'
import {getFirestore, doc, collection, runTransaction, onSnapshot, serverTimestamp, getDocs, getDoc, query, where, limit, writeBatch, updateDoc} from 'firebase/firestore'
import {parseScan, calcTotal, FREE_NTH} from './config.js'
import {getAuth, createUserWithEmailAndPassword, signOut} from 'firebase/auth'
const e = import.meta.env
const cfg = {apiKey:e.VITE_FB_API_KEY,authDomain:e.VITE_FB_AUTH_DOMAIN,projectId:e.VITE_FB_PROJECT_ID,appId:e.VITE_FB_APP_ID}
export const app = initializeApp(cfg)
// App Check (reCAPTCHA Enterprise / Fraud Defense): proves requests come from this website, not from a script. Turned on when the site key is set in .env
if (e.VITE_APPCHECK_SITE_KEY) {
  if (location.hostname === 'localhost') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  initializeAppCheck(app, {provider: new ReCaptchaEnterpriseProvider(e.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true})
}
export const db = getFirestore(app), auth = getAuth(app)

export function useMeta(live = true) { // undefined = loading, null = event not set up
  const [m, setM] = useState(undefined)
  useEffect(() => {
    if (live) return onSnapshot(doc(db,'meta','event'), s => setM(s.data()||null), () => setM(null))
    // Public visitors: ask once, then every 30 s while the tab is visible. A live listener would re-read the counter for EVERY visitor on EVERY booking.
    let stop = false
    const load = () => { if (document.visibilityState === 'hidden') return; getDoc(doc(db,'meta','event')).then(s => !stop && setM(s.data()||null)).catch(() => !stop && setM(p => p === undefined ? null : p)) }
    load(); const t = setInterval(load, 30000); document.addEventListener('visibilitychange', load)
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', load) }
  }, [live])
  return m
}
// Shrinks a payment screenshot in the browser (max 900px, JPEG) so it stays small; no Firebase Storage needed
export function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 900/Math.max(img.width, img.height)), c = document.createElement('canvas')
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s)
      c.getContext('2d').drawImage(img,0,0,c.width,c.height)
      let q = .6, d = c.toDataURL('image/jpeg',q)
      while (d.length > 250000 && q > .3) { q -= .1; d = c.toDataURL('image/jpeg',q) }
      res(d)
    }
    img.onerror = () => rej(new Error('Could not read this image'))
    img.src = URL.createObjectURL(file)
  })
}
// Atomic booking: one separate ticket per person, never sells more than capacity; price comes from the database
// Double-click / double-tap protection: the same booking (same person, guests, phone, ID) sent again while the first one is still
// running, or within 20 seconds after it finished, returns the SAME tickets instead of creating new ones. A failed booking can be retried at once.
const recent = new Map(); export const resetBookingBuffer = () => recent.clear() // (tests)
export function createBooking(data, status='pending', shot=null, staff=null) {
  const key = [status, staff?.uid || '', data.name, data.idNo, data.phone, ...(data.guests || [])].map(x => String(x).trim().toLowerCase()).join('~'), now = Date.now(), hit = recent.get(key)
  if (hit && (!hit.done || now - hit.t < 20000)) return hit.p
  for (const [k,v] of recent) if (v.done && now - v.t > 60000) recent.delete(k)
  const e = {done:false, t:now}; e.p = bookNow(data, status, shot, staff).then(r => { e.done = true; e.t = Date.now(); return r }, err => { recent.delete(key); throw err })
  recent.set(key, e); return e.p
}
async function bookNow(data, status, shot, staff) {
  const col = collection(db,'bookings'), meta = doc(db,'meta','event')
  const names = [data.name, ...(data.guests||[])], refs = names.map(() => doc(col)), {guests, ...base} = data, PRIV = ['phone','idType','idNo','payName','trx']
  let first = 0 // was inside the const above, so `first = seq + 1` threw "Assignment to constant variable"
  await runTransaction(db, async tx => {
    const m = await tx.get(meta); if (!m.exists()) throw new Error('Event not set up yet')
    const {capacity, held, seq, price=0, open=true} = m.data(), n = names.length
    if (open === false) throw new Error(staff ? 'Booking is paused by the admin. Desk sales are stopped until it is resumed.' : 'Online booking is paused right now. Please try again later.')
    if (held + n > capacity) throw new Error(`Only ${capacity-held} ticket(s) left`)
    first = seq + 1; tx.update(meta, {held: held+n, seq: seq+n, last: refs[n-1].id})
    names.forEach((nm,i) => tx.set(refs[i], {...(i ? Object.fromEntries(Object.entries(base).filter(([k]) => !PRIV.includes(k))) : base), name:nm.trim(), qty:1, type:'General', group:refs[0].id, no:seq+1+i, amount:(i+1)%FREE_NTH===0?0:price, groupQty:n, total:calcTotal(price,n), status,
      hasShot: i===0 && !!shot, checkedIn:false, sent:false, ...(staff ? {by:staff.uid, byName:staff.name} : {}), createdAt: serverTimestamp()}))
    if (shot) tx.set(doc(db,'shots',refs[0].id), {d: shot})
  })
  return refs.map((r,i) => ({id:r.id, no:first+i}))
}
export async function rejectGroup(ids) { // frees the seats again
  const meta = doc(db,'meta','event'), refs = ids.map(i => doc(db,'bookings',i))
  await runTransaction(db, async tx => {
    const ss = await Promise.all(refs.map(r => tx.get(r))), m = await tx.get(meta); let n = 0
    ss.forEach((s,i) => { if (s.data().status !== 'rejected') { tx.update(refs[i],{status:'rejected'}); n++ } })
    if (n) tx.update(meta,{held: m.data().held - n})
  })
}
// Accepts the QR text (ticket id), a ticket link, or the printed number (AKYSB-FANNAN-0002 / 0002 / 2)
export async function checkIn(input, staff) {
  try {
    const p = parseScan(input); let id = p.id
    if (p.no) {
      const s = await getDocs(query(collection(db,'bookings'), where('no','==',p.no), where('status','==','confirmed'), limit(1)))
      if (s.empty) return {ok:false, t:'INVALID: no confirmed ticket with this number', raw:input}
      id = s.docs[0].id
    }
    const r = await runTransaction(db, async tx => {
      const ref = doc(db,'bookings',id), s = await tx.get(ref)
      if (!s.exists()) return {ok:false,t:'INVALID ticket'}
      const d = s.data()
      if (d.status !== 'confirmed') return {ok:false,t:'Not confirmed (payment pending)',d}
      if (d.checkedIn) return {ok:false,t:'ALREADY USED',d}
      tx.update(ref,{checkedIn:true,checkedInAt:serverTimestamp(),checkedInBy:staff?.uid||'',checkedInByName:staff?.name||''})
      return {ok:true,t:'VALID',d}
    })
    return {...r, raw:input}
  } catch (e) { return {ok:false, t: e.code === 'permission-denied' ? 'No permission. Login with a gate or admin account.' : 'INVALID ticket', raw:input} }
}
// Admin creates a staff login without being logged out (uses a second temporary app)
let staffBusy = null // one account creation at a time; a double click joins the first one
export function createStaff(email, pw) { if (staffBusy) return staffBusy; staffBusy = makeStaff(email, pw).finally(() => { staffBusy = null }); return staffBusy }
async function makeStaff(email, pw) {
  const sec = getApps().find(a => a.name === 'sec') || initializeApp(cfg, 'sec'), a = getAuth(sec)
  const c = await createUserWithEmailAndPassword(a, email, pw); await signOut(a); return c.user.uid
}

// Deletes every booking (and payment screenshot) and starts the ticket numbers again from 1. Event settings, price and staff accounts stay.
export async function clearAllData() {
  const snap = await getDocs(collection(db,'bookings')), ids = snap.docs.map(d => d.id), shots = snap.docs.filter(d => d.data().hasShot).map(d => d.id)
  const wipe = async refs => { for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i+400).forEach(r => b.delete(r)); await b.commit() } }
  await wipe(ids.map(i => doc(db,'bookings',i)))
  await updateDoc(doc(db,'meta','event'), {held:0, seq:0, last:''})
  try { await wipe(shots.map(i => doc(db,'shots',i))) } catch { return {n:ids.length, shotsLeft:shots.length} } // screenshots are separate: a rules problem there must not block the clear
  return {n:ids.length, shotsLeft:0}
}
