// Security-rules tests against the Firestore emulator:   npm run test:rules   (needs Java + internet once)
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing'
import {doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, runTransaction, serverTimestamp, Timestamp} from 'firebase/firestore'
import fs from 'node:fs'
const env = await initializeTestEnvironment({projectId:'demo-fanan', firestore:{rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url),'utf8')}})
const SA = 'adsc.rwpl@gmail.com'
const anon = () => env.unauthenticatedContext().firestore()
const as = (uid, email='x@x.com') => env.authenticatedContext(uid, {email}).firestore()
const seed = async (fn) => env.withSecurityRulesDisabled(async c => fn(c.firestore()))
const resetDb = async () => { await env.clearFirestore(); await seed(async db => {
  await setDoc(doc(db,'meta','event'), {capacity:400, held:0, seq:0, price:500})
  await setDoc(doc(db,'users','desk1'), {role:'desk', name:'Desk 1', email:'d1@x.com'}); await setDoc(doc(db,'users','desk2'), {role:'desk', name:'Desk 2', email:'d2@x.com'})
  await setDoc(doc(db,'users','gate1'), {role:'gate', name:'Gate 1', email:'g1@x.com'}); await setDoc(doc(db,'users','adm2'), {role:'admin', name:'Adm', email:'a2@x.com'}) }) }
const ticket = (no, group, o={}) => ({name:'Ali', phone:'03001234567', idType:'CNIC', idNo:'1234512345671', jk:'Taxila', payName:'Ali', source:'online', qty:1, type:'General', group, no, amount:500, groupQty:1, total:500,
  status:'pending', hasShot:false, checkedIn:false, sent:false, createdAt:serverTimestamp(), ...o})
// Same transaction the app runs (src/firebase.js createBooking)
async function book(db, names, {status='pending', source='online', staff=null, tweak=(x=>x), shot=null, metaTweak=(x=>x)} = {}) {
  const col = collection(db,'bookings'), meta = doc(db,'meta','event'), refs = names.map(() => doc(col)); let first = 0
  await runTransaction(db, async tx => {
    const m = (await tx.get(meta)).data(), n = names.length; first = m.seq + 1
    tx.update(meta, metaTweak({held:m.held+n, seq:m.seq+n, last:refs[n-1].id}))
    names.forEach((nm,i) => tx.set(refs[i], tweak(ticket(first+i, refs[0].id, {name:nm, status, source, groupQty:n, ...(staff ? {by:staff, byName:'Desk'} : {})}))))
    if (shot) tx.set(doc(db,'shots',refs[0].id), {d:shot}) })
  return refs.map(r => r.id)
}
const put = (id, o={}) => seed(db => setDoc(doc(db,'bookings',id), ticket(1, id, {createdAt:Timestamp.now(), ...o})))
const tests = []; const T = (name, fn) => tests.push([name, fn])
const meta = db => doc(db,'meta','event')

// ---- public visitor
T('public can read the event counter', () => assertSucceeds(getDoc(meta(anon()))))
T('public CANNOT bump seq/held alone (no fake sold-out)', () => assertFails(updateDoc(meta(anon()), {held:400, seq:400, last:'x'})))
T('public CANNOT set held only', () => assertFails(updateDoc(meta(anon()), {held:400})))
T('public CANNOT change price/capacity', () => assertFails(updateDoc(meta(anon()), {price:0})))
T('public can book 2 tickets like the app does', async () => { await assertSucceeds(book(anon(), ['A','B'])); await seed(async db => { const m = (await getDoc(meta(db))).data(); if (m.held !== 2 || m.seq !== 2) throw new Error('counter wrong') }) })
T('public booking over capacity is refused', async () => { await seed(db => setDoc(meta(db), {capacity:3, held:3, seq:3, price:0})); await assertFails(book(anon(), ['A'])) })
T('public CANNOT jump counter by more than 5', () => assertFails(book(anon(), ['A'], {metaTweak:m => ({...m, held:m.held+9, seq:m.seq+9})})))
T('public CANNOT create a confirmed ticket', () => assertFails(book(anon(), ['A'], {status:'confirmed'})))
T('public CANNOT add extra/unknown fields', () => assertFails(book(anon(), ['A'], {tweak:t => ({...t, isAdmin:true})})))
T('public CANNOT set qty 2 on one ticket', () => assertFails(book(anon(), ['A'], {tweak:t => ({...t, qty:2})})))
T('public CANNOT claim to be desk staff', () => assertFails(book(anon(), ['A'], {tweak:t => ({...t, by:'desk1'})})))
T('public CANNOT back-date a ticket', () => assertFails(book(anon(), ['A'], {tweak:t => ({...t, createdAt:Timestamp.fromDate(new Date('2020-01-01'))})})))
T('public CANNOT pre-mark ticket as entered/sent', async () => { await assertFails(book(anon(), ['A'], {tweak:t => ({...t, checkedIn:true})})); await assertFails(book(anon(), ['A'], {tweak:t => ({...t, sent:true})})) })
T('public CANNOT use huge text', () => assertFails(book(anon(), ['A'.repeat(500)])))
T('public CANNOT list all bookings', () => assertFails(getDocs(collection(anon(),'bookings'))))
T('public can open a ticket only by its id', async () => { await put('tkt1'); await assertSucceeds(getDoc(doc(anon(),'bookings','tkt1'))) })
T('public CANNOT approve, edit or delete a ticket', async () => { await put('tkt1'); const db = anon(); await assertFails(updateDoc(doc(db,'bookings','tkt1'), {status:'confirmed'})); await assertFails(updateDoc(doc(db,'bookings','tkt1'), {name:'Hacker'})); await assertFails(deleteDoc(doc(db,'bookings','tkt1'))) })
T('public can attach a screenshot only to its own new booking', async () => { await assertSucceeds(book(anon(), ['A'], {shot:'data:image/jpeg;base64,AAAA'})); await assertFails(setDoc(doc(anon(),'shots','nobooking'), {d:'x'})) })
T('public CANNOT read screenshots or send huge ones', async () => { await seed(db => setDoc(doc(db,'shots','s1'), {d:'x'})); await assertFails(getDoc(doc(anon(),'shots','s1'))); await assertFails(book(anon(), ['A'], {shot:'x'.repeat(450000)})) })
T('public CANNOT touch users or other collections', async () => { await assertFails(getDoc(doc(anon(),'users','desk1'))); await assertFails(setDoc(doc(anon(),'users','evil'), {role:'admin'})); await assertFails(setDoc(doc(anon(),'secrets','a'), {a:1})) })
// ---- signed-in stranger (has an account but no role)
T('stranger CANNOT make themselves admin/desk/gate', async () => { const db = as('evil'); await assertFails(setDoc(doc(db,'users','evil'), {role:'admin', email:'x@x.com'})); await assertFails(getDocs(collection(db,'bookings'))); await assertFails(updateDoc(meta(db), {price:0})) })
T('stranger CANNOT read others\' user records', () => assertFails(getDoc(doc(as('evil'),'users','desk1'))))
T('stranger can still book as a normal visitor', () => assertSucceeds(book(as('evil'), ['A'])))
// ---- front desk
T('desk can sell 5 confirmed tickets in one go', () => assertSucceeds(book(as('desk1','d1@x.com'), ['A','B','C','D','E'], {status:'confirmed', source:'desk', staff:'desk1'})))
T('desk CANNOT sell as another desk user', () => assertFails(book(as('desk1','d1@x.com'), ['A'], {status:'confirmed', source:'desk', staff:'desk2'})))
T('desk sees only own sales', async () => { await put('mine', {by:'desk1', status:'confirmed', source:'desk'}); await put('theirs', {by:'desk2', status:'confirmed', source:'desk'}); const db = as('desk1','d1@x.com')
  await assertSucceeds(getDocs(query(collection(db,'bookings'), where('by','==','desk1')))); await assertFails(getDocs(collection(db,'bookings'))); await assertFails(getDocs(query(collection(db,'bookings'), where('by','==','desk2')))) })
T('desk can edit own ticket until WhatsApp is sent, then not', async () => { await put('mine', {by:'desk1', status:'confirmed', source:'desk'}); const db = as('desk1','d1@x.com')
  await assertSucceeds(updateDoc(doc(db,'bookings','mine'), {name:'Fixed', editedAt:serverTimestamp()})); await assertSucceeds(updateDoc(doc(db,'bookings','mine'), {sent:true}))
  await assertFails(updateDoc(doc(db,'bookings','mine'), {name:'Late edit'})) })
T('desk CANNOT approve/cancel/enter or edit other desk\'s tickets', async () => { await put('mine', {by:'desk1'}); await put('theirs', {by:'desk2'}); const db = as('desk1','d1@x.com')
  await assertFails(updateDoc(doc(db,'bookings','mine'), {status:'rejected'})); await assertFails(updateDoc(doc(db,'bookings','mine'), {checkedIn:true})); await assertFails(updateDoc(doc(db,'bookings','theirs'), {name:'x'})); await assertFails(deleteDoc(doc(db,'bookings','mine'))) })
T('desk CANNOT change price or users', async () => { const db = as('desk1','d1@x.com'); await assertFails(updateDoc(meta(db), {price:1})); await assertFails(setDoc(doc(db,'users','desk1'), {role:'admin'})) })
T('desk can open payment screenshots', async () => { await seed(db => setDoc(doc(db,'shots','s1'), {d:'x'})); await assertSucceeds(getDoc(doc(as('desk1','d1@x.com'),'shots','s1'))) })
// ---- gate
T('gate can look up one ticket by number, not browse all', async () => { await put('t1', {status:'confirmed'}); const db = as('gate1','g1@x.com')
  await assertSucceeds(getDocs(query(collection(db,'bookings'), where('no','==',1), where('status','==','confirmed'), limit(1)))); await assertFails(getDocs(collection(db,'bookings'))); await assertFails(getDocs(query(collection(db,'bookings'), limit(100)))) })
T('gate can check a confirmed ticket in, once', async () => { await put('t1', {status:'confirmed'}); const db = as('gate1','g1@x.com'), r = doc(db,'bookings','t1')
  await assertSucceeds(updateDoc(r, {checkedIn:true, checkedInAt:serverTimestamp(), checkedInBy:'gate1', checkedInByName:'Gate 1'})); await assertFails(updateDoc(r, {checkedIn:true, checkedInAt:serverTimestamp(), checkedInBy:'gate1', checkedInByName:'Gate 1'})) })
T('gate CANNOT enter a pending ticket or sign as someone else', async () => { await put('p1', {status:'pending'}); await put('t1', {status:'confirmed'}); const db = as('gate1','g1@x.com')
  await assertFails(updateDoc(doc(db,'bookings','p1'), {checkedIn:true, checkedInAt:serverTimestamp(), checkedInBy:'gate1', checkedInByName:'G'})); await assertFails(updateDoc(doc(db,'bookings','t1'), {checkedIn:true, checkedInAt:serverTimestamp(), checkedInBy:'desk1', checkedInByName:'G'})) })
T('gate CANNOT approve, edit, create or delete', async () => { await put('p1', {status:'pending'}); const db = as('gate1','g1@x.com')
  await assertFails(updateDoc(doc(db,'bookings','p1'), {status:'confirmed'})); await assertFails(updateDoc(doc(db,'bookings','p1'), {name:'x'})); await assertFails(deleteDoc(doc(db,'bookings','p1'))); await assertFails(book(db, ['A'], {status:'confirmed', source:'desk', staff:'gate1'})) })
T('gate sees only own scans', async () => { await put('s1', {status:'confirmed', checkedIn:true, checkedInBy:'gate1'}); const db = as('gate1','g1@x.com')
  await assertSucceeds(getDocs(query(collection(db,'bookings'), where('checkedInBy','==','gate1'), limit(500)))); await assertFails(getDocs(query(collection(db,'bookings'), where('checkedInBy','==','someone'), limit(500)))) })
T('gate CANNOT read screenshots or users', async () => { await seed(db => setDoc(doc(db,'shots','s1'), {d:'x'})); const db = as('gate1','g1@x.com'); await assertFails(getDoc(doc(db,'shots','s1'))); await assertFails(getDoc(doc(db,'users','desk1'))) })
// ---- admins
for (const [label, uid, email] of [['main admin (email)', 'sa', SA], ['role admin', 'adm2', 'a2@x.com']]) {
  T(`${label}: full control`, async () => { await put('t1'); const db = as(uid, email)
    await assertSucceeds(getDocs(collection(db,'bookings'))); await assertSucceeds(updateDoc(doc(db,'bookings','t1'), {status:'confirmed'})); await assertSucceeds(updateDoc(doc(db,'bookings','t1'), {name:'Edited', phone:'0300', payName:'P'}))
    await assertSucceeds(updateDoc(meta(db), {price:700, date:'Sat'})); await assertSucceeds(setDoc(doc(db,'users','newstaff'), {role:'gate', name:'N', email:'n@x.com'})); await assertSucceeds(getDocs(collection(db,'users'))); await assertSucceeds(deleteDoc(doc(db,'bookings','t1'))) }) }
T('admin can free seats (lower held)', async () => { await seed(db => setDoc(meta(db), {capacity:400, held:5, seq:5, price:0})); await assertSucceeds(updateDoc(meta(as('sa', SA)), {held:3})) })

// ---- pause + clear-all (admin tools)
T('public/desk booking is refused while booking is paused (rules, not only the page)', async () => { await seed(db => setDoc(meta(db), {capacity:400, held:0, seq:0, price:0, open:false})); await assertFails(book(anon(), ['A'])); await assertFails(book(as('desk1','d1@x.com'), ['A'], {status:'confirmed', source:'desk', staff:'desk1'})) })
T('admin can pause and resume booking', async () => { const db = as('sa', SA); await assertSucceeds(updateDoc(meta(db), {open:false})); await assertFails(book(anon(), ['A'])); await assertSucceeds(updateDoc(meta(db), {open:true})); await assertSucceeds(book(anon(), ['A'])) })
T('admin can release more tickets (capacity/total) but public cannot', async () => { await assertSucceeds(updateDoc(meta(as('sa', SA)), {capacity:150, total:450})); await assertFails(updateDoc(meta(anon()), {capacity:9999})) })
T('admin can delete screenshots; public/desk/gate cannot', async () => { await seed(db => setDoc(doc(db,'shots','s1'), {d:'x'})); await assertFails(deleteDoc(doc(anon(),'shots','s1'))); await assertFails(deleteDoc(doc(as('desk1','d1@x.com'),'shots','s1'))); await assertFails(deleteDoc(doc(as('gate1','g1@x.com'),'shots','s1'))); await assertSucceeds(deleteDoc(doc(as('sa', SA),'shots','s1'))) })
T('after "Clear all booking data" numbering restarts at 1 and booking works', async () => { await seed(async db => { await setDoc(meta(db), {capacity:400, held:7, seq:7, price:0, last:'old'}); await setDoc(doc(db,'bookings','old'), ticket(7,'old')) })
  const a = as('sa', SA); await assertSucceeds(deleteDoc(doc(a,'bookings','old'))); await assertSucceeds(updateDoc(meta(a), {held:0, seq:0, last:''})); await assertSucceeds(book(anon(), ['A','B'])) })

let bad = 0
for (const [name, fn] of tests) { await resetDb(); try { await fn(); console.log('  ok  ', name) } catch (e) { bad++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]) } }
console.log(`\n${tests.length - bad} of ${tests.length} passed`); await env.cleanup(); process.exit(bad ? 1 : 0)
