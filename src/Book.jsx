import {useState, useEffect, useRef} from 'react'; import {useNavigate, useParams, useSearchParams} from 'react-router-dom'
import {doc, onSnapshot} from 'firebase/firestore'; import {db, createBooking, compress, useMeta} from './firebase.js'
import {EVENT, JK, fmtId, validate, blank, calcTotal, stock, COMMUNITY_NOTE, MAX_PICK, FREE_NTH, guestNames, ticketCount} from './config.js'; import Ticket from './Ticket.jsx'; const downloadTicket = async (...a) => (await import('./ticketImage.js')).downloadTicket(...a)
const B = import.meta.env.BASE_URL

export function PersonFields({f, setF}) {
  const set = k => e => setF({...f,[k]:e.target.value})
  const qty = e => { const n = +e.target.value; setF({...f, qty:n, guests:Array.from({length:n-1},(_,i) => f.guests[i] || ''), free: n === 5 ? f.free || '' : ''}) }
  return (<>
    <label>Full name<input required value={f.name} onChange={set('name')}/></label>
    <label>ID type<select value={f.idType} onChange={e => setF({...f,idType:e.target.value,idNo:''})}><option>CNIC</option><option>Passport</option></select></label>
    <label>{f.idType==='CNIC'?'CNIC number':'Passport number'}<input required inputMode={f.idType==='CNIC'?'numeric':'text'} placeholder={f.idType==='CNIC'?'12345-1234567-1':'AB1234567'} value={f.idNo} onChange={e => setF({...f,idNo:fmtId(f.idType,e.target.value)})}/></label>
    <label>Jamatkhana<select required value={f.jk} onChange={set('jk')}><option value="">Select Jamatkhana</option>{JK.map(j => <option key={j}>{j}</option>)}</select></label>
    <label>WhatsApp number<input required inputMode="tel" placeholder="03001234567" value={f.phone} onChange={set('phone')}/></label>
    <label>Number of tickets<select value={f.qty} onChange={qty}>{Array.from({length:MAX_PICK},(_,i) => i+1).map(n => <option key={n}>{n}</option>)}</select></label>
    {f.guests.map((g,i) => <label key={i}>Guest {i+2} name (gets a separate ticket)<input required value={g} onChange={e => setF({...f,guests:f.guests.map((x,j) => j===i?e.target.value:x)})}/></label>)}
    {f.qty === 5 && <label>Guest 6 name: FREE ticket (optional, leave empty if not needed)<input value={f.free || ''} onChange={e => setF({...f,free:e.target.value})}/></label>}
  </>)
}
export function Amount({price, qty, info}) {
  if (!(price > 0)) return <p className="pill">Free entry</p>
  const paid = qty - Math.floor(qty/FREE_NTH), lines = String(info || '').split('|').map(s => s.trim()).filter(Boolean) // "|" in the admin setting = new line
  return (<div className="pay">
    <div className="paytot">Total to pay: Rs. {calcTotal(price,qty)}</div>
    <div className="paysub">Rs. {price} × {paid} ticket{paid>1?'s':''}{qty >= FREE_NTH ? ' · 6th ticket is free!' : qty === 5 ? ' · Add a 6th guest below: that ticket is free!' : ' · Buy 5 tickets and get the 6th free'}</div>
    {lines.length > 0 && <div className="paybox"><small>Send payment to</small>{lines.map((l,i) => <b key={i}>{l}</b>)}</div>}
    {lines.length > 0 && <div className="paynote">After paying, attach the payment screenshot below and write the account holder's name.</div>}
  </div>)
}
export function PayName({f, setF, required}) {
  return <label>Name of the person who paid (account holder name){!required && ' (optional)'}<input required={required} placeholder="Name on the JazzCash / Easypaisa / bank account" value={f.payName} onChange={e => setF({...f,payName:e.target.value})}/></label>
}
const Cal = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{verticalAlign:'-3px'}}><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>

export default function Book() {
  const nav = useNavigate(), m = useMeta(false), [f,setF] = useState(blank()), [file,setFile] = useState(null), [err,setErr] = useState(''), [busy,setBusy] = useState(false), lock = useRef(false)
  const price = m?.price || 0, k = m ? stock(m) : null, left = k ? k.left : null, paused = !!k && !k.open
  async function submit(e) {
    e.preventDefault(); if (busy || lock.current) return; setErr('')
    const v = validate(f); if (v) return setErr(v)
    if (price > 0 && !f.payName.trim()) return setErr('Enter the name of the person who paid')
    if (price > 0 && !file) return setErr('Please attach your payment screenshot')
    lock.current = true; setBusy(true) // lock is instant (state is not): a fast double tap cannot start two bookings
    try {
      const shot = price > 0 ? await compress(file) : null
      const made = await createBooking({name:f.name.trim(), phone:f.phone.trim(), idType:f.idType, idNo:f.idNo, jk:f.jk, guests:guestNames(f), payName:f.payName.trim(), source:'online'}, 'pending', shot)
      nav('/t/' + made[0].id + (made.length > 1 ? '?g=' + made.slice(1).map(x => x.id).join(',') : ''))
    } catch (x) { setErr(x.message); setBusy(false); lock.current = false }
  }
  return (<div className="bookwrap"><div className="bg" style={{'--bg-d':`url("${new URL(B+'hero.webp', document.baseURI).href}")`, '--bg-m':`url("${new URL(B+'hero-m.webp', document.baseURI).href}")`}}/>
    <form className="card formcard" onSubmit={submit}>
      <h1>Book your ticket</h1><p className="muted center">{EVENT.name}</p>
      <div className="chips"><span className="chip"><Cal/> {m?.date || EVENT.date}</span><span className="chip">🕘 {EVENT.time}</span><span className="chip">📍 {EVENT.venue}</span><span className="chip">🚪 Entry: {EVENT.entry}</span></div>
      <div className="notice">{COMMUNITY_NOTE.map((s,i) => <p key={i}>{s}</p>)}</div>
      {paused && <p className="err center">Online booking is paused right now. Please check again later.</p>}
      {left !== null && !paused && <p className="pill" style={{alignSelf:'center'}}>{left > 0 ? `${left} tickets left` : 'SOLD OUT'}</p>}
      {m === null && <p className="err">Booking has not opened yet.</p>}
      {m && left !== 0 && !paused && <>
        <PersonFields f={f} setF={setF}/>
        <Amount price={price} qty={ticketCount(f)} info={m.payInfo || EVENT.payInfo}/>
        {price > 0 && <PayName f={f} setF={setF} required/>}
        {price > 0 && <label>Payment screenshot<input type="file" accept="image/*" onChange={e => setFile(e.target.files[0] || null)}/></label>}
        {err && <p className="err">{err}</p>}
        <button disabled={busy}>{busy ? 'Please wait...' : 'Submit booking'}</button></>}
    </form><p className="sub2 onbg">{EVENT.org}</p></div>)
}

export function TicketPage() {
  const {id} = useParams(), m = useMeta(false), [b,setB] = useState(undefined), [sib,setSib] = useState({})
  useEffect(() => onSnapshot(doc(db,'bookings',id), s => setB(s.exists()?s.data():null), () => setB(null)), [id])
  // The booker's link has ?g=<other ticket ids>: every ticket of the booking is shown on this one page
  const [qs] = useSearchParams(), key = (qs.get('g') || '').split(',').filter(x => x && x !== id).join(','), others = key ? key.split(',') : []
  useEffect(() => { const un = others.map(i => onSnapshot(doc(db,'bookings',i), s => s.exists() && setSib(p => ({...p,[i]:s.data()})), () => {})); return () => un.forEach(f => f()) }, [key])
  if (b === undefined) return <div className="page"><p>Loading...</p></div>
  if (!b) return <div className="page"><p className="err">Ticket not found.</p></div>
  const gq = b.groupQty || 1, total = b.total ?? b.amount ?? 0
  return (<div className="page wide">
    {b.status==='pending' && <div className="card thanks"><h2>Ya Ali Madad,<br/>Dear {b.name},</h2>
      <p>Thank you for registering{total>0 ? ' and completing the payment' : ''} for <b>{EVENT.name}</b>.</p>
      <p>Our team will {total>0 ? 'verify your payment' : 'confirm your booking'} and share your confirmed {gq>1?'tickets':'ticket'} shortly via the provided WhatsApp number{b.phone && <> (<b>{b.phone}</b>)</>}.</p>
      <p>We look forward to welcoming you! ✨</p>
      <p className="pill">{gq} ticket{gq>1?'s':''} booked{total>0 ? ` · Total Rs. ${total}` : ''}</p>
      <p className="muted">You can also keep this page link and open it later to get your {gq>1?'tickets':'ticket'} here.</p></div>}
    {b.status==='rejected' && <p className="card err">This booking was cancelled. Please contact the organizers.</p>}
    {b.status==='confirmed' && (() => { const all = [[id,b], ...others.map(i => [i,sib[i]]).filter(([,d]) => d && d.status==='confirmed' && d.group === b.group)]
      return <>{all.map(([i,d],k) => <div key={i}>
        {all.length>1 && <h3 className="center">Ticket {k+1} of {all.length}: {d.name}</h3>}
        <Ticket b={d} id={i} date={m?.date}/>
        <div className="center"><button onClick={() => downloadTicket(d, i, m?.date)}>⬇ Download {all.length>1 ? `ticket ${k+1}` : 'ticket'} (image)</button></div></div>)}
      <p className="muted center">Show {all.length>1 ? 'each ticket\'s' : 'this ticket\'s'} QR code at the gate.</p></> })()}
  </div>)
}
