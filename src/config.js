export const EVENT = {
  name: 'FANNAN 2026 – Rawalpindi Local Finals', short: 'FANNAN 2026', subtitle: 'RAWALPINDI LOCAL FINALS',
  org: 'Aga Khan Youth and Sports Board, Rawalpindi',
  date: 'To be announced', time: '9:00 AM to 5:00 PM',
  venue: 'Gandhara Heritage & Cultural Centre, F-9 Park, Islamabad',
  entry: 'Gate No. 5 (Opposite F-8, Islamabad)',
  payInfo: 'JazzCash/Easypaisa: 03XX-XXXXXXX (Account title)', // admin can change in Settings
}
export const SUPER = 'adsc.rwpl@gmail.com'
export const JK = ['Rawalpindi','Karimabad','Ali Muhammad','Attock','Taxila','Abbottabad','Muzaffarabad','Burban','Prince Villas','Golden Estate','Golden Jubilee','Spring Villas','Islamabad','Barakhu','Ali Pur','Chitral Town','Other']
export const fmtCnic = v => { const d = v.replace(/\D/g,'').slice(0,13); return d.length>12 ? `${d.slice(0,5)}-${d.slice(5,12)}-${d.slice(12)}` : d.length>5 ? `${d.slice(0,5)}-${d.slice(5)}` : d }
export const blank = () => ({name:'',phone:'',idType:'CNIC',idNo:'',jk:'',qty:1,guests:[],free:'',payName:''})
// The form offers 1 to 5 tickets. With 5 chosen an optional 6th guest box appears: filled = a 6th ticket (free), empty = just 5 tickets.
export const freeGuest = f => f.qty === 5 ? (f.free || '').trim() : ''
export const guestNames = f => [...f.guests.map(g => g.trim()), ...(freeGuest(f) ? [freeGuest(f)] : [])]
export const ticketCount = f => 1 + guestNames(f).length
// Buy 5, get the 6th free: the 6th ticket of one booking costs nothing (a booking can have 1 to 6 tickets)
export const MAX_TICKETS = 6, MAX_PICK = 5, FREE_NTH = 6 // up to 6 tickets in a booking; the person picks 1-5 and the 6th is the optional free guest
export const calcTotal = (price, qty) => price * (qty - Math.floor(qty/FREE_NTH))
// What is printed on a ticket: that ticket's own price (the free 6th ticket says Free). The booking total is not shown.
export const payText = b => { const a = Number(b.amount ?? 0); return {label: 'Payment', value: a > 0 ? 'PKR ' + a.toLocaleString('en-US') : 'Free'} }
export const fmtId = (type, v) => type === 'CNIC' ? fmtCnic(v) : v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,15)
const ph = p => p.replace(/[\s-]/g,'')
export const validate = f => !f.name.trim() ? 'Enter full name'
  : f.idType === 'CNIC' && f.idNo.replace(/\D/g,'').length !== 13 ? 'CNIC must be 13 digits'
  : f.idType === 'Passport' && f.idNo.length < 5 ? 'Enter a valid passport number'
  : !f.jk ? 'Select Jamatkhana'
  : !(/^(\+?92|0)3\d{9}$/.test(ph(f.phone)) || /^\+\d{8,15}$/.test(ph(f.phone))) ? 'Enter a valid WhatsApp number, e.g. 03001234567'
  : f.guests.some(g => !g.trim()) ? 'Enter the name of every guest' : ''
export const waNumber = p => { let d = String(p).replace(/\D/g,''); if (d.startsWith('0')) d = '92'+d.slice(1); return d }
// all = ids of every ticket of the booking: that link then shows all the tickets (the ids stay private inside the link)
export const ticketUrl = (id, all) => location.origin + location.pathname + '#/t/' + id + (all && all.length > 1 ? '?g=' + all.filter(i => i !== id).join(',') : '')
// ts = tickets of one booking: [{id, name, phone}]. One message lists every person's own ticket link.
export const ticketNo = n => 'AKYSB-FANNAN-' + String(n).padStart(4,'0')
// Plain text only (no emoji): WhatsApp Desktop on Windows breaks emoji in pre-filled links and customers received "?" characters.
export const waLink = (ts, date) => { const n = ts.length, d = date || EVENT.date, name = EVENT.name.replace(/\u2013/g, '-')
  return `https://wa.me/${waNumber(ts[0].phone)}?text=` + encodeURIComponent(
`Ya Ali Madad,
Dear ${ts[0].name},

Thank you for registering for *${name}*. We are pleased to confirm your ${n>1?n+' tickets':'ticket'}.

*Your ticket${n>1?'s':''}*
${ts.map(t => `${t.name}: ${ticketUrl(t.id)}`).join('\n')}

*Date:* ${d}
*Time:* ${EVENT.time}
*Venue:* ${EVENT.venue}
*Entry:* ${EVENT.entry}

Kindly present the QR code of your ticket at the entrance${n>1?' (each guest needs their own ticket)':''}.

We look forward to welcoming you!

With warm regards,
${EVENT.org}

Ticketing system powered by *${POWERED}*
WhatsApp: ${POWERED_PHONE}`) }
// What a scan/typed code means: ticket number (AKYSB-FANNAN-0002 / 0002 / 2) or ticket id / ticket link
export const parseScan = input => { const t = String(input).trim(), m = t.match(/^(?:AKYSB-?FAN{1,2}AN-?)?0*(\d{1,6})$/i); return m ? {no:Number(m[1])} : {id:t.split('/t/').pop().split(/[?#\s]/)[0]} }

// ---- Ticket stock: `total` tickets exist, `capacity` of them are released to sell (public + desk), `open:false` pauses online booking
export const CLEAR_PIN = '5155' // typed by the admin to confirm "Clear all booking data"
export const stock = m => { const released = Number(m.capacity)||0, total = Math.max(Number(m.total)||0, released), sold = Number(m.held)||0
  return {total, released, sold, left: Math.max(0, released-sold), unreleased: total-released, open: m.open !== false} }
export const checkStock = (total, released, sold) => !Number.isInteger(total) || !Number.isInteger(released) ? 'Enter whole numbers'
  : total < 1 ? 'Total tickets must be at least 1' : released < sold ? `Released cannot be less than already sold/held (${sold})`
  : released > total ? `Released cannot be more than total (${total})` : ''
export const POWERED = 'MM Tech & AI Solution'
export const COMMUNITY_NOTE = ['This event is exclusively for the community. If you are not a member of the community, please do not purchase a ticket.', 'Please note that entry will not be permitted to outsiders, even if a ticket has been purchased.']
export const POWERED_URL = 'https://www.instagram.com/mm_tech_aisolution/'
export const POWERED_PHONE = '+92 341 5561436', POWERED_WA = 'https://wa.me/923415561436'
