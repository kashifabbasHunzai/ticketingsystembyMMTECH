import {useEffect, useRef, useState} from 'react'
import {onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'firebase/auth'
import {collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, limit, serverTimestamp, setDoc, updateDoc, where, writeBatch} from 'firebase/firestore'
import jsQR from 'jsqr'
import {auth, db, createBooking, rejectGroup, checkIn, createStaff, clearAllData, useMeta} from './firebase.js'
import {waLink, validate, fmtId, blank, calcTotal, guestNames, ticketCount, JK, SUPER, EVENT, CLEAR_PIN, stock, checkStock} from './config.js'; import {PersonFields, Amount, PayName} from './Book.jsx'; import {cell, txt} from './csv.js'
const TABS = {admin:[['list','Bookings'],['desk','Desk sale'],['report','Desk report'],['online','Online report'],['master','Master report'],['checkin','Check-in report'],['scan','Gate scan'],['scans','My scans'],['set','Settings'],['users','Staff accounts']],
  desk:[['desk','Desk sale'],['mine','My sales']], gate:[['scan','Gate scan'],['scans','My scans']]}
const tm = s => s ? new Date(s*1000).toLocaleString() : ''
const groups = rows => { const m = {}; rows.forEach(r => (m[r.group||r.id] = m[r.group||r.id] || []).push(r))
  return Object.values(m).map(g => g.sort((a,b) => a.no-b.no)).sort((a,b) => (b[0].createdAt?.seconds||0) - (a[0].createdAt?.seconds||0)) }

export default function Admin() {
  const [u,setU] = useState(undefined), [role,setRole] = useState(null), [me,setMe] = useState(null), [tab,setTab] = useState(''), [rows,setRows] = useState([]), m = useMeta(), gen = useRef(0)
  useEffect(() => onAuthStateChanged(auth, async x => {
    const mine = ++gen.current // a slow answer for an earlier login must never overwrite a newer one
    setU(x); setRole(null); setMe(null); setTab(''); setRows([]) // forget everything from the previous person (tab, loaded bookings)
    if (!x) return
    if (x.email === SUPER) { setMe({uid:x.uid,name:'Admin'}); return setRole('admin') }
    try { const s = await getDoc(doc(db,'users',x.uid)); if (mine !== gen.current) return; setMe({uid:x.uid,name:s.data()?.name||x.email}); setRole(s.exists() ? s.data().role : 'none') } catch { if (mine === gen.current) setRole('none') }
  }), [])
  useEffect(() => role === 'admin' ? onSnapshot(query(collection(db,'bookings'),orderBy('createdAt','desc')), s => setRows(s.docs.map(d => ({id:d.id,...d.data()})))) : undefined, [role])
  if (u === undefined || (u && !role)) return <div className="page">Loading...</div>
  if (!u) return <Login/>
  const tabs = TABS[role] || [], cur = tab || (tabs[0]||[])[0]
  return (<div className="page wide"><div className="row"><h1>{{admin:'Admin',desk:'Front desk',gate:'Gate scan'}[role] || 'No access'}</h1><button className="ghost" onClick={() => signOut(auth)}>Logout</button></div>
    {role === 'none' && <p className="card err">Your account has no role yet. Ask the admin to add you in Staff accounts.</p>}
    {role === 'admin' && m === null && <button onClick={() => setDoc(doc(db,'meta','event'),{capacity:150,total:450,open:true,held:0,seq:0,price:0})}>Set up event (450 tickets, 150 released)</button>}
    {role === 'admin' && m && (() => { const k = stock(m); return <p className="pill">Sold/held {k.sold} · Available now {k.left} (released {k.released} of {k.total}){k.unreleased ? ` · Not released yet ${k.unreleased}` : ''}{!k.open && ' · BOOKING PAUSED (online + desk)'}</p> })()}
    {(role === 'desk' || role === 'gate') && m && (() => { const k = stock(m); return <p className={k.open ? 'pill' : 'pill paused'}>Sold {k.sold} · Available now {k.left}{!k.open && ' · TICKETING PAUSED'}</p> })()}
    {tabs.length > 1 && <div className="tabs">{tabs.map(([k,l]) => <button key={k} className={cur===k?'on':''} onClick={() => setTab(k)}>{l}</button>)}</div>}
    {cur === 'list' && <List rows={rows} date={m?.date}/>}{cur === 'desk' && <Desk m={m} me={me}/>}{cur === 'mine' && <Mine me={me} date={m?.date}/>}{cur === 'report' && <Report rows={rows}/>}{cur === 'online' && <OnlineReport rows={rows}/>}{cur === 'master' && <MasterReport rows={rows}/>}{cur === 'checkin' && <CheckinReport rows={rows}/>}{cur === 'scans' && <MyScans me={me}/>}
    {cur === 'scan' && <Scan me={me}/>}{cur === 'set' && m && <><Stock m={m}/><Settings m={m}/><Danger/></>}{cur === 'users' && <Users/>}</div>)
}
function Login() {
  const [e,setE] = useState(''), [p,setP] = useState(''), [er,setEr] = useState('')
  return (<form className="page card" onSubmit={async x => { x.preventDefault(); try { await signInWithEmailAndPassword(auth,e,p) } catch { setEr('Wrong email or password') } }}>
    <h1>Staff login</h1><label>Email<input type="email" value={e} onChange={x => setE(x.target.value)}/></label>
    <label>Password<input type="password" value={p} onChange={x => setP(x.target.value)}/></label>{er && <p className="err">{er}</p>}<button>Login</button></form>)
}
// Edit one booking (all its tickets). Admin: always. Desk: only before "Send on WhatsApp" is pressed.
function GroupEdit({ts, onClose, admin}) {
  const f0 = ts[0], [f,setF] = useState({phone:f0.phone, idType:f0.idType||'CNIC', idNo:f0.idNo||f0.cnic||'', jk:f0.jk||'', payName:f0.payName||'', names:ts.map(t => t.name)}), [er,setEr] = useState('')
  async function save(e) {
    e.preventDefault(); setEr('')
    const v = validate({name:f.names[0], phone:f.phone, idType:f.idType, idNo:f.idNo, jk:f.jk, guests:f.names.slice(1)}); if (v) return setEr(v)
    try { const b = writeBatch(db)
      ts.forEach((t,i) => b.update(doc(db,'bookings',t.id), {name:f.names[i].trim(), jk:f.jk, editedAt:serverTimestamp(), ...(i === 0 ? {phone:f.phone.trim(), idType:f.idType, idNo:f.idNo, ...(admin ? {payName:f.payName.trim()} : {})} : {})}))
      await b.commit(); onClose() } catch (x) { setEr('Could not save: ' + x.message) }
  }
  return (<form className="card" onSubmit={save}><b>Edit (ticket numbers stay the same)</b>
    {f.names.map((n,i) => <label key={i}>{i ? `Guest ${i+1} name (#${ts[i].no})` : `Name (#${ts[0].no})`}<input required value={n} onChange={e => setF({...f,names:f.names.map((x,j) => j===i?e.target.value:x)})}/></label>)}
    <label>ID type<select value={f.idType} onChange={e => setF({...f,idType:e.target.value,idNo:''})}><option>CNIC</option><option>Passport</option></select></label>
    <label>ID number<input required value={f.idNo} onChange={e => setF({...f,idNo:fmtId(f.idType,e.target.value)})}/></label>
    <label>Jamatkhana<select value={f.jk} onChange={e => setF({...f,jk:e.target.value})}><option value="">Select</option>{JK.map(j => <option key={j}>{j}</option>)}</select></label>
    <label>WhatsApp number<input required value={f.phone} onChange={e => setF({...f,phone:e.target.value})}/></label>
    {admin && <label>Paid by (account holder name)<input value={f.payName} onChange={e => setF({...f,payName:e.target.value})}/></label>}
    {er && <p className="err">{er}</p>}<div className="btns"><button>Save changes</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div></form>)
}
function GroupCard({ts, mode, date}) {
  const [edit,setEdit] = useState(false), [shot,setShot] = useState(undefined), f = ts[0], gid = f.group || f.id, ids = ts.map(t => t.id)
  const tot = ts.reduce((s,t) => s + (t.amount||0), 0), entered = ts.some(t => t.checkedIn), canEdit = mode === 'admin' || !f.sent
  async function view() { if (shot !== undefined) return setShot(undefined); const s = await getDoc(doc(db,'shots',gid)); setShot(s.exists() ? s.data().d : null) }
  const batch = data => { const b = writeBatch(db); ids.forEach(i => b.update(doc(db,'bookings',i), data)); return b.commit() }
  const wa = f.status === 'confirmed' && <a className="btn green" href={waLink(ts, date)} target="_blank" rel="noreferrer" onClick={() => mode === 'desk' && !f.sent && batch({sent:true}).catch(() => {})}>{f.sent && mode==='desk' ? 'Send again on WhatsApp' : 'Send on WhatsApp'}</a>
  return (<div className="card"><div className="item"><div>
    <b>{ts.map(t => `#${t.no} ${t.name}`).join(' · ')}</b><span className={'st '+f.status}>{f.status}</span>{f.sent && <span className="st confirmed">sent</span>}{entered && <span className="st confirmed">{ts.filter(t => t.checkedIn).length} entered</span>}<br/>
    <small>{f.phone} · {f.idType||'CNIC'} {f.idNo||f.cnic||'-'} · {f.jk||'-'} · {f.source}{f.byName ? ` · by ${f.byName}` : ''}{f.payName ? ` · paid by ${f.payName}` : ''} · {tm(f.createdAt?.seconds)}{tot>0 ? ` · Rs. ${tot}` : ''}{f.trx ? ` · ${f.trx}` : ''}</small></div>
    <div className="btns">
      {mode === 'admin' && f.hasShot && <button className="ghost" onClick={view}>Screenshot</button>}
      {mode === 'admin' && f.status === 'pending' && <button onClick={() => batch({status:'confirmed'})}>Approve</button>}
      {canEdit && <button className="ghost" onClick={() => setEdit(!edit)}>Edit</button>}
      {mode === 'admin' && f.status !== 'rejected' && !entered && <button className="ghost" onClick={() => confirm('Cancel this booking and free the seats?') && rejectGroup(ids)}>Reject</button>}
      {wa}</div></div>
    {edit && <GroupEdit ts={ts} admin={mode === 'admin'} onClose={() => setEdit(false)}/>}
    {shot !== undefined && (shot ? <img className="shot" src={shot} alt="payment"/> : <p>No screenshot found</p>)}</div>)
}
function List({rows, date}) {
  const [flt,setFlt] = useState('all'), [q,setQ] = useState('')
  const shown = groups(rows).filter(g => (flt==='all' || g[0].status===flt) && g.map(r => [r.name,r.phone,r.idNo,r.cnic,r.jk,r.byName].join(' ')).join(' ').toLowerCase().includes(q.toLowerCase()))
  return (<><input placeholder="Search name, phone, CNIC/passport, Jamatkhana, staff" value={q} onChange={e => setQ(e.target.value)}/>
    <div className="tabs">{['all','pending','confirmed','rejected'].map(k => <button key={k} className={flt===k?'on':''} onClick={() => setFlt(k)}>{k}</button>)}</div>
    {shown.map(g => <GroupCard key={g[0].group||g[0].id} ts={g} mode="admin" date={date}/>)}</>)
}
function Mine({me, date}) {
  const [rows,setRows] = useState([])
  useEffect(() => onSnapshot(query(collection(db,'bookings'), where('by','==',me.uid)), s => setRows(s.docs.map(d => ({id:d.id,...d.data()})))), [me.uid])
  const gs = groups(rows), tickets = rows.filter(r => r.status !== 'rejected')
  return (<><p className="pill">My sales: {tickets.length} tickets · Rs. {tickets.reduce((s,r) => s+(r.amount||0),0)}</p>
    <p className="muted">You can edit a booking until you press "Send on WhatsApp".</p>{gs.map(g => <GroupCard key={g[0].group||g[0].id} ts={g} mode="desk" date={date}/>)}</>)
}
function Report({rows}) {
  const by = {}, on = {n:0,amt:0}, jk = {}
  rows.filter(r => r.status !== 'rejected').forEach(r => {
    if (r.source !== 'desk') { on.n++; on.amt += r.amount||0; return }
    const j = jk[r.jk||'-'] = jk[r.jk||'-'] || {n:0,amt:0}; j.n++; j.amt += r.amount||0
    const k = r.byName || 'Before staff accounts', x = by[k] = by[k] || {n:0,amt:0,a:null,b:0}, s = r.createdAt?.seconds||0
    x.n++; x.amt += r.amount||0; x.a = Math.min(x.a ?? s, s); x.b = Math.max(x.b, s) })
  const ks = Object.keys(by)
  return (<><div className="card"><b>Desk sales by Jamatkhana</b>{Object.entries(jk).sort((a,b) => b[1].n-a[1].n).map(([k,v]) => <span key={k}>{k}: {v.n} ticket{v.n>1?'s':''} · Rs. {v.amt}</span>)}{!ks.length && <span>No desk sales yet.</span>}</div>
    {ks.map(k => <div className="card" key={k}><b>{k}</b><span>{by[k].n} tickets · Rs. {by[k].amt}</span><small>First sale {tm(by[k].a)} · Last sale {tm(by[k].b)}</small></div>)}
    <div className="card"><b>Online (booked by the public)</b><span>{on.n} tickets · Rs. {on.amt}</span></div>
    <p className="muted">Exact time of every sale is shown in the Bookings tab.</p></>)
}
function Desk({m, me}) {
  const [f,setF] = useState(blank()), [pay,setPay] = useState('Cash'), [note,setNote] = useState(''), [done,setDone] = useState(null), [er,setEr] = useState(''), [busy,setBusy] = useState(false), lock = useRef(false)
  async function go(e) {
    e.preventDefault(); if (busy || lock.current) return; setEr(''); const v = validate(f); if (v) return setEr(v)
    if ((m?.price||0) > 0 && pay !== 'Cash' && !f.payName.trim()) return setEr('Enter the name of the person who paid')
    lock.current = true; setBusy(true) // instant lock: a fast double click cannot sell twice
    try {
      const d = {payName:f.payName.trim(), name:f.name.trim(), phone:f.phone.trim(), idType:f.idType, idNo:f.idNo, jk:f.jk, guests:guestNames(f), source:'desk', trx: pay + (note ? ': '+note : '')}
      const r = await createBooking(d,'confirmed',null,me), names = [d.name,...d.guests]
      setDone({pay:d.trx, total:calcTotal(m?.price||0, names.length), ts:r.map((x,i) => ({id:x.id, no:x.no, name:names[i], phone:d.phone}))})
    } catch (x) { setEr(x.message) }
    setBusy(false); lock.current = false
  }
  const sent = () => { const b = writeBatch(db); done.ts.forEach(t => b.update(doc(db,'bookings',t.id),{sent:true})); b.commit().catch(() => {}) }
  if (done) return (<div className="card"><p className="ok">✓ Sale completed: {done.ts.length} ticket{done.ts.length>1?'s':''}</p>
    {done.ts.map(t => <div key={t.id}><b>#{t.no}</b> {t.name}</div>)}<p className="muted">Phone: {done.ts[0].phone}<br/>Payment: {done.pay}{done.total>0 && <><br/>Total: <b>Rs. {done.total}</b></>}</p>
    <a className="btn green" href={waLink(done.ts, m?.date)} target="_blank" rel="noreferrer" onClick={sent}>Send tickets on WhatsApp</a>
    <p className="muted">Until you press the WhatsApp button you can still edit this booking in "My sales".</p>
    <button className="ghost" onClick={() => { setDone(null); setF(blank()); setNote('') }}>New sale</button></div>)
  if (m && m.open === false) return <p className="card err">Booking is paused by the admin. Desk sales are stopped until it is resumed.</p>
  return (<form className="card" onSubmit={go}><PersonFields f={f} setF={setF}/><Amount price={m?.price||0} qty={ticketCount(f)} info=""/>
    <label>Payment received as<select value={pay} onChange={e => setPay(e.target.value)}><option>Cash</option><option>JazzCash/Easypaisa/Bank</option></select></label>
    {(m?.price||0) > 0 && <PayName f={f} setF={setF} required={pay !== 'Cash'}/>}
    <label>Note (transaction ID, optional)<input value={note} onChange={e => setNote(e.target.value)}/></label>
    {er && <p className="err">{er}</p>}<button disabled={busy}>{busy ? 'Creating tickets...' : 'Sell ticket(s)'}</button></form>)
}
function saveCsv(name, rows) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'})); a.download = name; a.click() }
function MasterReport({rows}) {
  const live = rows.filter(r => r.status !== 'rejected'), sum = l => l.reduce((s,r) => s+(r.amount||0), 0), desk = live.filter(r => r.source === 'desk'), online = live.filter(r => r.source !== 'desk')
  const by = (l, k) => { const m = {}; l.forEach(r => { const x = m[k(r)] = m[k(r)] || {n:0,amt:0,d:0,o:0}; x.n++; x.amt += r.amount||0; r.source === 'desk' ? x.d++ : x.o++ }); return Object.entries(m).sort((a,b) => b[1].n-a[1].n) }
  const staff = by(desk, r => r.byName || 'Before staff accounts'), jk = by(live, r => r.jk || '-'), day = new Date().toISOString().slice(0,10)
  const first = {}; rows.forEach(r => { if (r.phone) first[r.group||r.id] = r })
  const tickets = () => saveCsv(`fanan-all-tickets-${day}.csv`, [['Ticket no','Name','Phone','ID type','ID number','Jamatkhana','Source','Sold by (staff)','Paid by (account holder)','Amount (Rs)','Status','Entered','Booked at','Payment note'],
    ...rows.slice().sort((a,b) => a.no-b.no).map(r => { const f = first[r.group||r.id] || r; return [r.no, r.name, txt(f.phone), f.idType||'CNIC', txt(f.idNo||f.cnic), r.jk||'', r.source, r.byName||'', f.payName||'', r.amount||0, r.status, r.checkedIn?'Yes':'No', tm(r.createdAt?.seconds), f.trx||''] })])
  const summary = () => saveCsv(`fanan-sales-summary-${day}.csv`, [['MASTER SALES REPORT',day],[],['Overall'],['Tickets',live.length],['Total Rs.',sum(live)],['Desk tickets',desk.length,'Desk Rs.',sum(desk)],['Online tickets',online.length,'Online Rs.',sum(online)],[],
    ['By staff (desk)','Tickets','Rs.'],...staff.map(([k,v]) => [k,v.n,v.amt]),[],['By Jamatkhana','Tickets','Desk','Online','Rs.'],...jk.map(([k,v]) => [k,v.n,v.d,v.o,v.amt])])
  return (<><div className="card"><b>Master report (all sales)</b><span>{live.length} tickets · Rs. {sum(live)}</span><small>Desk: {desk.length} tickets · Rs. {sum(desk)} | Online: {online.length} tickets · Rs. {sum(online)}</small>
    <small>Entered at the gate: {live.filter(r => r.checkedIn).length} · Rejected: {rows.length - live.length}</small>
    <div className="btns"><button onClick={summary}>⬇ Download summary (Excel/CSV)</button><button className="ghost" onClick={tickets}>⬇ Download all tickets (Excel/CSV)</button></div></div>
    <div className="card"><b>By staff (desk sales)</b>{staff.map(([k,v]) => <span key={k}>{k}: {v.n} tickets · Rs. {v.amt}</span>)}{!staff.length && <span>No desk sales yet.</span>}</div>
    <div className="card"><b>By Jamatkhana</b>{jk.map(([k,v]) => <span key={k}>{k}: {v.n} tickets (desk {v.d}, online {v.o}) · Rs. {v.amt}</span>)}</div></>)
}
function CheckinReport({rows}) {
  const conf = rows.filter(r => r.status === 'confirmed'), inn = conf.filter(r => r.checkedIn), jk = {}, sc = {}
  conf.forEach(r => { const x = jk[r.jk||'-'] = jk[r.jk||'-'] || {t:0,i:0}; x.t++; if (r.checkedIn) { x.i++; const s = r.checkedInByName || 'Unknown'; sc[s] = (sc[s]||0) + 1 } })
  const dl = () => saveCsv(`fanan-checkins-${new Date().toISOString().slice(0,10)}.csv`, [['Ticket no','Name','Jamatkhana','Entered at','Scanned by'], ...inn.slice().sort((a,b) => (a.checkedInAt?.seconds||0)-(b.checkedInAt?.seconds||0)).map(r => [r.no, r.name, r.jk||'', tm(r.checkedInAt?.seconds), r.checkedInByName||''])])
  return (<><div className="card"><b>Check-in report</b><span>{inn.length} of {conf.length} confirmed tickets have entered · {conf.length-inn.length} still to come</span><button onClick={dl}>⬇ Download check-ins (Excel/CSV)</button></div>
    <div className="card"><b>Checked in by Jamatkhana</b>{Object.entries(jk).sort((a,b) => b[1].i-a[1].i).map(([k,v]) => <span key={k}>{k}: {v.i} of {v.t} entered</span>)}</div>
    <div className="card"><b>Scanned by (gate staff)</b>{Object.entries(sc).map(([k,v]) => <span key={k}>{k}: {v} ticket{v>1?'s':''}</span>)}{!inn.length && <span>No check-ins yet.</span>}</div></>)
}
function MyScans({me}) {
  const [rows,setRows] = useState([])
  useEffect(() => onSnapshot(query(collection(db,'bookings'), where('checkedInBy','==',me.uid), limit(500)), s => setRows(s.docs.map(d => ({id:d.id,...d.data()})).sort((a,b) => (b.checkedInAt?.seconds||0)-(a.checkedInAt?.seconds||0)))), [me.uid])
  return (<><p className="pill">My scans: {rows.length} ticket{rows.length===1?'':'s'}</p>{!rows.length && <p className="card">You have not scanned any ticket yet.</p>}
    {rows.map(r => <div className="card" key={r.id}><b>#{r.no} {r.name}</b><small>{r.jk||'-'} · {tm(r.checkedInAt?.seconds)}</small></div>)}</>)
}
function OnlineReport({rows}) {
  const on = rows.filter(r => r.source !== 'desk'), live = on.filter(r => r.status !== 'rejected'), jk = {}
  live.forEach(r => jk[r.jk||'-'] = (jk[r.jk||'-']||0) + 1)
  const cnt = s => on.filter(r => r.status === s).length, secs = on.map(r => r.createdAt?.seconds||0).filter(Boolean)
  return (<><div className="card"><b>Online bookings (booked by the public)</b>
    <span>{live.length} tickets · Rs. {live.reduce((s,r) => s+(r.amount||0),0)}</span>
    <small>Pending {cnt('pending')} · Confirmed {cnt('confirmed')} · Rejected {cnt('rejected')}</small>
    {secs.length > 0 && <small>First booking {tm(Math.min(...secs))} · Last booking {tm(Math.max(...secs))}</small>}</div>
    <div className="card"><b>By Jamatkhana</b>{Object.entries(jk).sort((a,b) => b[1]-a[1]).map(([k,v]) => <span key={k}>{k}: {v} ticket{v>1?'s':''}</span>)}{!live.length && <span>No online bookings yet.</span>}</div>
    {groups(on).map(g => <div className="card item" key={g[0].group||g[0].id}><div><b>{g.map(t => `#${t.no} ${t.name}`).join(' · ')}</b><span className={'st '+g[0].status}>{g[0].status}</span><br/>
      <small>{g[0].phone} · {g[0].jk||'-'} · Rs. {g.reduce((s,t) => s+(t.amount||0),0)} · {tm(g[0].createdAt?.seconds)}</small></div></div>)}</>)
}
// Camera scanner: reads the video itself (native BarcodeDetector when the browser has it, jsQR otherwise), whole frame, no scan box
function Scan({me}) {
  const [r,setR] = useState(null), [on,setOn] = useState(false), [code,setCode] = useState(''), [st,setSt] = useState(''), vid = useRef(null), box = useRef(null)
  const run = async t => setR(await checkIn(t, me))
  const decode = async (src, w, h, cx) => {
    if ('BarcodeDetector' in window) { try { const c = await new window.BarcodeDetector({formats:['qr_code']}).detect(src); if (c[0]) return c[0].rawValue } catch {} }
    const d = cx.getImageData(0,0,w,h), q = jsQR(d.data, w, h, {inversionAttempts:'attemptBoth'}); return q ? q.data : ''
  }
  useEffect(() => {
    if (!on) return
    let stream, stop = false, last = '', lastAt = 0 // a QR is read once; it is read again only after it has left the camera view (or another ticket comes)
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', {willReadFrequently:true})
    async function loop() {
      if (stop) return
      const v = vid.current
      if (v && v.readyState >= 2 && v.videoWidth) {
        const w = Math.min(v.videoWidth, 800), h = Math.round(w * v.videoHeight / v.videoWidth); cv.width = w; cv.height = h; cx.drawImage(v,0,0,w,h)
        const txt = await decode(v, w, h, cx)
        const now = Date.now()
        if (txt) { const fresh = txt !== last; last = txt; lastAt = now
          if (fresh) { setR({ok:null, t:'Checking...', raw:txt}); navigator.vibrate?.(40); run(txt) } } // not awaited: next ticket can be read straight away
        else if (last && now - lastAt > 700) last = '' // QR left the view, ready for the next scan
      }
      setTimeout(loop, 50)
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}, audio:false})
        if (stop) return stream.getTracks().forEach(t => t.stop())
        vid.current.srcObject = stream; await vid.current.play(); box.current?.scrollIntoView({behavior:'smooth', block:'start'}); setSt('Camera is on. Hold the ticket QR in front of the camera.'); loop()
      } catch (e) { setOn(false); setR({ok:false, t:`Camera could not start (${e?.name||'error'}). Allow camera permission, open in Chrome/Safari, or use "Other ways" below.`}) }
    })()
    return () => { stop = true; setSt(''); stream && stream.getTracks().forEach(t => t.stop()) }
  }, [on])
  async function photo(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return
    try {
      const bm = await createImageBitmap(f), s = Math.min(1, 1600/Math.max(bm.width,bm.height)), cv = document.createElement('canvas'); cv.width = Math.round(bm.width*s); cv.height = Math.round(bm.height*s)
      const cx = cv.getContext('2d', {willReadFrequently:true}); cx.drawImage(bm,0,0,cv.width,cv.height)
      const txt = await decode(cv, cv.width, cv.height, cx); txt ? run(txt) : setR({ok:false,t:'No QR code found in this image'})
    } catch { setR({ok:false,t:'Could not read this image'}) }
  }
  return (<div className="card" ref={box}><button onClick={() => { setR(null); setOn(!on) }}>{on ? 'Stop camera' : 'Start camera'}</button>
    <video ref={vid} className="cam" playsInline muted style={{display:on?'block':'none'}}/>{st && <p className="muted center">{st}</p>}
    {r && <div className={'card scan '+(r.ok===null?'':r.ok?'ok':'bad')}><h2>{r.t}</h2>{r.d && <p>{r.d.name} · ticket #{r.d.no}{r.d.jk ? ` · ${r.d.jk}` : ''}</p>}{r.raw && <small>Scanned: {r.raw}</small>}</div>}
    <details><summary>Other ways to check a ticket</summary>
      <label>Type the ticket number (e.g. AKYSB-FANNAN-0002 or 2) or paste the ticket link<input value={code} onChange={e => setCode(e.target.value)}/></label><button onClick={() => code && run(code)}>Check</button>
      <label>Scan a QR from an image (a photo, or the ticket image saved from WhatsApp)<input type="file" accept="image/*" onChange={photo}/></label></details>
    <p className="muted">Open this page in Chrome/Safari (not inside WhatsApp) and allow camera access.</p></div>)
}
function Settings({m}) {
  const [f,setF] = useState({price:m.price||0, date:m.date||'', payInfo:m.payInfo||''}), [ok,setOk] = useState('')
  const set = k => e => setF({...f,[k]:e.target.value})
  return (<form className="card" onSubmit={async e => { e.preventDefault(); await updateDoc(doc(db,'meta','event'),{price:Number(f.price)||0, date:f.date.trim(), payInfo:f.payInfo.trim()}); setOk('Saved') }}>
    <label>Ticket price (Rs. per ticket, 0 = free)<input type="number" min="0" value={f.price} onChange={set('price')}/></label>
    <label>Event date (shown on ticket)<input placeholder={EVENT.date} value={f.date} onChange={set('date')}/></label>
    <label>Payment details (shown to online buyers, in bold). Use | to start a new line<input placeholder={EVENT.payInfo} value={f.payInfo} onChange={set('payInfo')}/></label>
    {ok && <p className="ok">{ok}</p>}<button>Save settings</button></form>)
}
function Users() {
  const [rows,setRows] = useState([]), [f,setF] = useState({name:'',email:'',password:'',role:'desk'}), [msg,setMsg] = useState(''), [busy,setBusy] = useState(false), lock = useRef(false)
  const set = k => e => setF({...f,[k]:e.target.value})
  useEffect(() => onSnapshot(collection(db,'users'), s => setRows(s.docs.map(d => ({id:d.id,...d.data()})))), [])
  async function add(e) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setMsg('')
    try { const uid = await createStaff(f.email.trim(), f.password); await setDoc(doc(db,'users',uid),{email:f.email.trim(), name:f.name.trim(), role:f.role}); setMsg('Account created. Share the email and password privately.'); setF({name:'',email:'',password:'',role:f.role}) }
    catch (x) { setMsg(x.message) }
    setBusy(false); lock.current = false
  }
  return (<><form className="card" onSubmit={add}><label>Name<input required value={f.name} onChange={set('name')}/></label>
    <label>Email<input type="email" required value={f.email} onChange={set('email')}/></label>
    <label>Password (min 6, use a strong one)<input required minLength="6" value={f.password} onChange={set('password')}/></label>
    <label>Role<select value={f.role} onChange={set('role')}><option value="desk">Front desk (sell tickets)</option><option value="gate">Gate (scan only)</option><option value="admin">Admin</option></select></label>
    {msg && <p className="ok">{msg}</p>}<button disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button></form>
    {rows.map(r => <div className="card item" key={r.id}><div><b>{r.name}</b> · {r.role}<br/><small>{r.email}</small></div>
      <button className="ghost" onClick={() => confirm('Remove access for '+r.email+'?') && deleteDoc(doc(db,'users',r.id))}>Remove access</button></div>)}</>)
}

// Pause/resume online booking and release the tickets in steps (e.g. 450 total, release 150 now, the rest later)
function Stock({m}) {
  const k = stock(m), [f,setF] = useState({total:String(k.total), released:String(k.released)}), [msg,setMsg] = useState(''), [err,setErr] = useState('')
  const write = async data => { setMsg(''); setErr(''); try { await updateDoc(doc(db,'meta','event'), data); setMsg('Saved') } catch (e) { setErr('Could not save: '+e.message) } }
  const save = (total, released) => { const er = checkStock(total, released, k.sold); if (er) { setMsg(''); return setErr(er) }
    setF({total:String(total), released:String(released)}); write({total, capacity:released}) }
  return (<div className="card"><b>Booking and ticket release</b>
    <p className={k.open ? 'ok' : 'err'}>Booking (online and desk) is {k.open ? 'OPEN' : 'PAUSED'}</p>
    <button type="button" className={k.open ? 'ghost' : ''} onClick={() => write({open: !k.open})}>{k.open ? '⏸ Pause all booking (online + desk)' : '▶ Resume all booking'}</button>
    <p className="muted">Total {k.total} · Released {k.released} · Sold/held {k.sold} · Available now {k.left} · Not released yet {k.unreleased}</p>
    <label>Total tickets for the event<input type="number" min="1" value={f.total} onChange={e => setF({...f,total:e.target.value})}/></label>
    <label>Released for sale so far (online + desk)<input type="number" min="0" value={f.released} onChange={e => setF({...f,released:e.target.value})}/></label>
    <div className="btns"><button type="button" onClick={() => save(Number(f.total), Number(f.released))}>Save release</button>
      {k.unreleased > 0 && <button type="button" className="ghost" onClick={() => save(k.total, k.total)}>Release all remaining ({k.unreleased})</button>}</div>
    {msg && <p className="ok">{msg}</p>}{err && <p className="err">{err}</p>}</div>)
}
// Wipes all bookings (test data) after typing the PIN
function Danger() {
  const [pin,setPin] = useState(''), [busy,setBusy] = useState(false), [msg,setMsg] = useState(''), [err,setErr] = useState('')
  async function wipe() { setBusy(true); setMsg(''); setErr('')
    try { const r = await clearAllData(); setPin(''); setMsg(`Done. ${r.n} booking(s) deleted. Ticket numbers start from 1 again.` + (r.shotsLeft ? ` (${r.shotsLeft} payment screenshot(s) could not be deleted, check Firestore rules for the shots collection.)` : '')) } catch (e) { setErr('Could not clear: '+e.message) }
    setBusy(false) }
  return (<div className="card"><b>Clear all booking data</b>
    <p className="muted">Deletes every booking, ticket, check-in and payment screenshot, and starts ticket numbers from 1 again. Price, date, staff accounts and ticket release settings stay. This cannot be undone.</p>
    <label>Enter PIN to confirm<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)}/></label>
    <button type="button" className="danger" disabled={pin !== CLEAR_PIN || busy} onClick={wipe}>{busy ? 'Deleting...' : 'Delete all booking data'}</button>
    {pin && pin !== CLEAR_PIN && <p className="muted">Wrong PIN</p>}{msg && <p className="ok">{msg}</p>}{err && <p className="err">{err}</p>}</div>)
}
