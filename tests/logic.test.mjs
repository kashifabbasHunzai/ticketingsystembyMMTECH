// Plain logic tests (no Firebase needed):  npm run test:logic
globalThis.location = {origin:'https://fanan-akysb-rwp.web.app', pathname:'/'}
import assert from 'node:assert/strict'
import {calcTotal, validate, fmtCnic, fmtId, waNumber, waLink, parseScan, blank, JK, stock, checkStock, ticketUrl} from '../src/config.js'
import {cell, txt} from '../src/csv.js'
let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('  ok  ', name) } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1 } }
const ok = (o={}) => ({...blank(), name:'Ali', idNo:'12345-1234567-1', jk:'Taxila', phone:'03001234567', ...o})

t('5th ticket free: totals for 1..5 tickets', () => { assert.deepEqual([1,2,3,4,5].map(q => calcTotal(500,q)), [500,1000,1500,2000,2000]) })
t('valid booking passes', () => assert.equal(validate(ok()), ''))
t('CNIC must be exactly 13 digits', () => { assert.match(validate(ok({idNo:'12345-123456-1'})), /13 digits/); assert.equal(validate(ok({idNo:'1234512345671'})), '') })
t('passport needs no 13 digits', () => assert.equal(validate(ok({idType:'Passport', idNo:'AB12345'})), ''))
t('passport too short is rejected', () => assert.match(validate(ok({idType:'Passport', idNo:'A1'})), /passport/i))
t('Jamatkhana is required; Chitral Town and Other exist', () => { assert.match(validate(ok({jk:''})), /Jamatkhana/); assert.ok(JK.includes('Chitral Town') && JK.at(-1) === 'Other') })
t('phone formats', () => { for (const p of ['03001234567','+923001234567','0300-1234567','+14155551234']) assert.equal(validate(ok({phone:p})), '', p); for (const p of ['12345','0200123456','abc']) assert.notEqual(validate(ok({phone:p})), '', p) })
t('every guest needs a name', () => { assert.match(validate(ok({qty:2, guests:['']})), /guest/i); assert.equal(validate(ok({qty:2, guests:['Sara']})), '') })
t('CNIC/ID formatting', () => { assert.equal(fmtCnic('1234512345671999'), '12345-1234567-1'); assert.equal(fmtId('Passport','ab-12 34!'), 'AB1234') })
t('WhatsApp number normalisation', () => { assert.equal(waNumber('0300 1234567'), '923001234567'); assert.equal(waNumber('+92 300 1234567'), '923001234567') })
t('scan input: QR id, link, and ticket numbers', () => {
  assert.deepEqual(parseScan('Xk3F9aQ2mZpL0vB7nR4t'), {id:'Xk3F9aQ2mZpL0vB7nR4t'})
  assert.deepEqual(parseScan('https://x.web.app/#/t/Xk3F9aQ2mZpL0vB7nR4t'), {id:'Xk3F9aQ2mZpL0vB7nR4t'})
  for (const s of ['AKYSB-FANNAN-0002','AKYSB-FANAN-0002','akysb-fannan-0002','0002','2',' 2 ']) assert.deepEqual(parseScan(s), {no:2}, s) })
t('WhatsApp message has every ticket link, event and name', () => {
  const m = decodeURIComponent(waLink([{id:'AAA',name:'Ali',phone:'03001234567'},{id:'BBB',name:'Sara',phone:'03001234567'}], 'Sat 20 Dec').split('text=')[1])
  for (const x of ['Ya Ali Madad','FANNAN 2026 – Rawalpindi Local Finals','Gandhara Heritage','Gate No. 5','#/t/AAA','#/t/BBB','Sara:','Sat 20 Dec']) assert.ok(m.includes(x), x) })
t('CSV blocks formula injection but keeps phone/ID text cells', () => {
  assert.equal(cell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`)
  for (const s of ['+1','-1','@SUM(A1)']) assert.ok(cell(s).startsWith(`"'`), s)
  assert.equal(cell('Ali, Khan'), '"Ali, Khan"'); assert.equal(cell(txt('03001234567')), '"=""03001234567"""')
  assert.equal(txt('=cmd|calc'), '="cmdcalc"') })
t('stock: released vs total, available, pause flag', () => {
  assert.deepEqual(stock({capacity:150, total:450, held:40}), {total:450, released:150, sold:40, left:110, unreleased:300, open:true})
  assert.deepEqual(stock({capacity:400, held:0}), {total:400, released:400, sold:0, left:400, unreleased:0, open:true})
  assert.equal(stock({capacity:10, held:3, open:false}).open, false); assert.equal(stock({capacity:5, held:9}).left, 0) })
t('stock settings are validated', () => {
  assert.equal(checkStock(450,150,40), ''); assert.match(checkStock(100,150,40), /more than total/); assert.match(checkStock(450,30,40), /less than already sold/)
  assert.match(checkStock(0,0,0), /at least 1/); assert.match(checkStock(1.5,1,0), /whole numbers/) })
t('one link shows every ticket of a booking; single ticket has no extra part; scan reads both', () => {
  assert.equal(ticketUrl('A',['A','B','C']), 'https://fanan-akysb-rwp.web.app/#/t/A?g=B,C'); assert.equal(ticketUrl('A',['A']), 'https://fanan-akysb-rwp.web.app/#/t/A')
  assert.deepEqual(parseScan(ticketUrl('A',['A','B'])), {id:'A'}) })
console.log(`\n${n} passed` + (process.exitCode ? ', some FAILED' : ''))
