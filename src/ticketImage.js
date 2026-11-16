import QRCode from 'qrcode'
import {EVENT, ticketNo, payText, POWERED, POWERED_PHONE} from './config.js'
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
// Draws the ticket on a canvas (returns the canvas)
export async function renderTicket(b, id, date) {
  const B = import.meta.env.BASE_URL, W = 1400, H = 652, c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'), no = ticketNo(b.no), pay = payText(b)
  try { await document.fonts.load("800 64px Fraunces"); await document.fonts.load("500 26px 'DM Sans'") } catch {}
  const [fan, org, mm, qr] = await Promise.all([load(B+'fanan.png'), load(B+'akysb.jpg'), load(B+'mmtech.webp'), load(await QRCode.toDataURL(id,{width:400,margin:2,errorCorrectionLevel:'M'}))])
  const rr = (a,b2,w,h,r,fill,stroke) => { x.beginPath(); x.roundRect(a,b2,w,h,r); if (fill) { x.fillStyle = fill; x.fill() } if (stroke) { x.strokeStyle = stroke; x.lineWidth = 3; x.stroke() } }
  const SANS = "'DM Sans', Arial, sans-serif", SERIF = "Fraunces, Georgia, serif"
  x.save(); x.beginPath(); x.roundRect(0,0,W,H,36); x.clip()
  x.fillStyle = '#fffde7'; x.fillRect(0,0,W,H); x.fillStyle = '#1c74e9'; x.fillRect(1060,0,340,H); x.restore()
  x.setLineDash([12,10]); x.strokeStyle = 'rgba(29,78,90,.45)'; x.lineWidth = 3; x.beginPath(); x.moveTo(1060,20); x.lineTo(1060,H-20); x.stroke(); x.setLineDash([])
  const g = x.createLinearGradient(60,40,240,220); g.addColorStop(0,'#1d4e5a'); g.addColorStop(.35,'#2b78b8'); g.addColorStop(.7,'#f2a33a'); g.addColorStop(1,'#2fa38a')
  x.fillStyle = g; x.beginPath(); x.arc(150,140,92,0,7); x.fill(); x.fillStyle = '#fffdf0'; x.beginPath(); x.arc(150,140,84,0,7); x.fill()
  x.drawImage(fan,150-64,140-40,128,80)
  x.fillStyle = '#1d4e5a'; x.textAlign = 'left'; x.font = '800 72px '+SERIF; x.fillText(EVENT.short,280,138)
  x.fillStyle = '#3d6872'; x.font = '500 28px '+SANS; x.fillText(EVENT.subtitle,282,186)
  const box = (bx,by,bw,l,v,fs=28) => { rr(bx,by,bw,76,18,null,'#1d4e5a'); x.fillStyle = '#1d4e5a'; x.font = '500 17px '+SANS; x.fillText(l,bx+22,by+26); x.font = '700 '+fs+'px '+SANS; x.fillText(v,bx+22,by+58) }
  box(60,235,440,'Date',date||EVENT.date); box(520,235,440,'Time',EVENT.time); box(60,324,900,'Venue',EVENT.venue,25); box(60,413,900,'Entry',EVENT.entry,25)
  x.font = '500 17px '+SANS; x.fillStyle = '#1d4e5a'; x.fillText('Name',60,535); x.fillText('Ticket type',520,535); x.fillText('Admits',690,535); x.fillText(pay.label,850,535)
  x.font = '700 28px '+SANS; x.fillText(b.name.slice(0,24),60,572); x.fillText(b.type||'General',520,572); x.fillText((b.qty||1)+((b.qty||1)>1?' persons':' person'),690,572); x.fillText(pay.value,850,572)
  x.save(); x.beginPath(); x.arc(1230,78,46,0,7); x.clip(); x.drawImage(org,1184,32,92,92); x.restore()
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 20px '+SANS; x.fillText('Aga Khan Youth and Sports',1230,158); x.fillText('Board, Rawalpindi',1230,183)
  rr(1115,225,230,230,22,'#fff'); x.drawImage(qr,1127,237,206,206)
  x.font = '700 27px '+SANS; x.fillText(no,1230,505); x.font = '500 19px '+SANS; x.fillText('Show this QR code at the gate',1230,540)
  // "powered by" corner (bottom right)
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(1085,568); x.lineTo(1375,568); x.stroke()
  x.save(); x.beginPath(); x.arc(1110,605,22,0,7); x.clip(); x.drawImage(mm,1088,583,44,44); x.restore()
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = '500 13px '+SANS; x.fillText('Ticketing system powered by',1142,594); x.font = '700 14px '+SANS; x.fillText(POWERED,1142,613); x.font = '500 12px '+SANS; x.globalAlpha = .9; x.fillText('WhatsApp '+POWERED_PHONE,1142,632); x.globalAlpha = 1
  return c
}
// Draws the ticket and downloads it as a PNG image
export async function downloadTicket(b, id, date) {
  const c = await renderTicket(b, id, date)
  c.toBlob(bl => { const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = `FANNAN-ticket-${String(b.no).padStart(4,'0')}.png`; a.click() }, 'image/png')
}
