import {describe, it, expect, vi, beforeEach} from 'vitest'
const store = {}; let n = 0
vi.mock('firebase/app', () => ({initializeApp: () => ({}), getApps: () => []}))
vi.mock('firebase/app-check', () => ({initializeAppCheck: () => {}, ReCaptchaEnterpriseProvider: class {}}))
vi.mock('firebase/auth', () => ({getAuth: () => ({}), createUserWithEmailAndPassword: vi.fn(), signOut: vi.fn()}))
vi.mock('firebase/firestore', () => {
  const ref = (path, id) => ({path, id})
  return {
    getFirestore: () => ({}), serverTimestamp: () => 'TS', onSnapshot: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(), writeBatch: vi.fn(), updateDoc: vi.fn(),
    collection: (db, name) => ({col: name}),
    doc: (a, ...rest) => a.col ? ref(`${a.col}/id${++n}`, `id${n}`) : ref(rest.join('/'), rest[rest.length-1]),
    runTransaction: async (db, fn) => fn({
      get: async r => ({exists: () => store[r.path] !== undefined, data: () => store[r.path]}),
      update: (r, d) => { store[r.path] = {...store[r.path], ...d} }, set: (r, d) => { store[r.path] = d } })
  }
})
const {createBooking, checkIn} = await import('../src/firebase.js')
const person = {name:'Ali', phone:'03001234567', idType:'CNIC', idNo:'1234512345671', jk:'Taxila', payName:'Ali', guests:[], source:'online'}
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; n = 0; store['meta/event'] = {capacity:400, held:0, seq:0, price:500} })
describe('createBooking', () => {
  it('books 5 tickets: sequential numbers, 5th free, private data only on the first, counter + last ticket updated', async () => {
    const out = await createBooking({...person, guests:['B','C','D','E']}, 'pending', 'data:image/jpeg;base64,AA')
    expect(out.map(x => x.no)).toEqual([1,2,3,4,5])
    const docs = out.map(x => store[`bookings/${x.id}`])
    expect(docs.map(d => d.amount)).toEqual([500,500,500,500,0]); expect(docs.every(d => d.total === 2000 && d.groupQty === 5 && d.qty === 1 && d.status === 'pending')).toBe(true)
    expect(docs[0].phone).toBe('03001234567'); expect(docs[0].idNo).toBeTruthy(); docs.slice(1).forEach(d => { expect(d.phone).toBeUndefined(); expect(d.idNo).toBeUndefined(); expect(d.payName).toBeUndefined() })
    expect(new Set(docs.map(d => d.group)).size).toBe(1); expect(docs[0].group).toBe(out[0].id); expect(docs[0].hasShot).toBe(true); expect(docs[1].hasShot).toBe(false)
    expect(store['meta/event']).toMatchObject({held:5, seq:5, last:out[4].id}); expect(store[`shots/${out[0].id}`]).toEqual({d:'data:image/jpeg;base64,AA'}) })
  it('numbers continue after earlier bookings', async () => { await createBooking(person); const out = await createBooking({...person, guests:['B']}); expect(out.map(x => x.no)).toEqual([2,3]); expect(store['meta/event']).toMatchObject({held:3, seq:3}) })
  it('refuses when not enough tickets are left, and changes nothing', async () => { store['meta/event'].held = 399; store['meta/event'].seq = 399
    await expect(createBooking({...person, guests:['B']})).rejects.toThrow('Only 1 ticket(s) left'); expect(store['meta/event']).toMatchObject({held:399, seq:399}); expect(Object.keys(store)).toEqual(['meta/event']) })
  it('respects the released amount (capacity) not the total', async () => { store['meta/event'] = {capacity:150, total:450, held:150, seq:150, price:0}; await expect(createBooking(person)).rejects.toThrow('Only 0 ticket(s) left') })
  it('refuses while booking is paused (online and desk, with different messages)', async () => { store['meta/event'].open = false
    await expect(createBooking(person)).rejects.toThrow(/paused right now/); await expect(createBooking(person, 'confirmed', null, {uid:'d', name:'Desk'})).rejects.toThrow(/Desk sales are stopped/) })
  it('refuses when the event is not set up', async () => { delete store['meta/event']; await expect(createBooking(person)).rejects.toThrow('Event not set up yet') })
  it('desk sale stores who sold it', async () => { const [t] = await createBooking({...person, source:'desk', trx:'Cash'}, 'confirmed', null, {uid:'d1', name:'Desk 1'}); expect(store[`bookings/${t.id}`]).toMatchObject({status:'confirmed', by:'d1', byName:'Desk 1', trx:'Cash', sent:false, checkedIn:false}) })
})
describe('checkIn', () => {
  const put = (id, o) => { store[`bookings/${id}`] = {name:'Ali', no:1, status:'confirmed', checkedIn:false, ...o} }
  it('valid once, then already used', async () => { put('t1'); const a = await checkIn('t1', {uid:'g1', name:'Gate'}); expect(a.ok).toBe(true); expect(store['bookings/t1']).toMatchObject({checkedIn:true, checkedInBy:'g1', checkedInByName:'Gate'})
    const b = await checkIn('t1', {uid:'g1', name:'Gate'}); expect(b).toMatchObject({ok:false, t:'ALREADY USED'}) })
  it('accepts a ticket link and rejects unknown / unconfirmed', async () => { put('t2'); expect((await checkIn('https://x.web.app/#/t/t2?g=a,b', {uid:'g', name:'G'})).ok).toBe(true)
    expect((await checkIn('nope', {uid:'g', name:'G'})).t).toMatch(/INVALID/); put('p1', {status:'pending'}); expect((await checkIn('p1', {uid:'g', name:'G'})).t).toMatch(/Not confirmed/) })
})
