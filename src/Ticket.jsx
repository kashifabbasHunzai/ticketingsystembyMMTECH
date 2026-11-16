import {QRCodeSVG} from 'qrcode.react'; import {EVENT, ticketNo, payText, POWERED, POWERED_URL, POWERED_PHONE, POWERED_WA} from './config.js'
const B = import.meta.env.BASE_URL
export default function Ticket({b, id, date}) {
  const no = ticketNo(b.no), pay = payText(b)
  return (<div className="ticket">
    <div className="main">
      <div className="top">
        <div className="badge"><div><img src={B+'fanan.png'} alt="FANNAN 2026"/></div></div>
        <div><h2 className="title">{EVENT.short}</h2><p className="sub">{EVENT.subtitle}</p></div>
      </div>
      <div className="facts">
        <div className="fact"><small>Date</small><b>{date||EVENT.date}</b></div>
        <div className="fact"><small>Time</small><b>{EVENT.time}</b></div>
        <div className="fact venue"><small>Venue</small><b>{EVENT.venue}</b></div>
        <div className="fact venue"><small>Entry</small><b>{EVENT.entry}</b></div>
      </div>
      <div className="holder">
        <div><span>Name</span><b>{b.name}</b></div>
        <div><span>Ticket type</span><b>{b.type||'General'}</b></div>
        <div><span>Admits</span><b>{b.qty} {b.qty>1?'persons':'person'}</b></div>
        <div><span>{pay.label}</span><b>{pay.value}</b></div>
      </div>
    </div>
    <div className="stub">
      <img src={B+'akysb.jpg'} alt="AKYSB"/><p className="orgname">{EVENT.org}</p>
      <div className="qr"><QRCodeSVG value={id} size={256} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" style={{width:'100%',height:'100%'}}/></div>
      <div className="no">{no}</div><small>Show this QR code at the gate</small>
      <div className="poweredT"><a href={POWERED_URL} target="_blank" rel="noopener noreferrer"><img src={B+'mmtech.webp'} alt="MM Tech & AI Solution"/></a><span>Ticketing system powered by<br/><a href={POWERED_URL} target="_blank" rel="noopener noreferrer"><b>{POWERED}</b></a><br/><a className="ph" href={POWERED_WA} target="_blank" rel="noopener noreferrer">{POWERED_PHONE}</a></span></div>
    </div>
  </div>)
}
