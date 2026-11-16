import {useLocation} from 'react-router-dom'; import {POWERED, POWERED_URL, POWERED_PHONE, POWERED_WA} from './config.js'
const B = import.meta.env.BASE_URL
export default function Footer() {
  const home = useLocation().pathname === '/' // booking page has the banner as background: footer goes to the corner there, centred on other pages
  return <footer className={'powered' + (home ? ' corner' : '')}><a href={POWERED_URL} target="_blank" rel="noopener noreferrer" aria-label="MM Tech & AI Solution on Instagram"><img src={B+'mmtech.webp'} alt="MM Tech & AI Solution" width="34" height="34"/></a>
    <span>Ticketing system powered by <a href={POWERED_URL} target="_blank" rel="noopener noreferrer"><b>{POWERED}</b></a><br/><a className="ph" href={POWERED_WA} target="_blank" rel="noopener noreferrer">WhatsApp {POWERED_PHONE}</a></span></footer>
}
