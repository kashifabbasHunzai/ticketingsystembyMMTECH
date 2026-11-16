import React, {Suspense, lazy} from 'react'; import {createRoot} from 'react-dom/client'
import {HashRouter, Routes, Route} from 'react-router-dom'
import Book, {TicketPage} from './Book.jsx'; import Footer from './Footer.jsx'; import './styles.css'
const Admin = lazy(() => import('./Admin.jsx')) // staff-only code: public visitors never download it
createRoot(document.getElementById('root')).render(
  <HashRouter><Routes>
    <Route path="/" element={<Book/>}/><Route path="/t/:id" element={<TicketPage/>}/>
    <Route path="/admin" element={<Suspense fallback={<div className="page">Loading...</div>}><Admin/></Suspense>}/>
  </Routes><Footer/></HashRouter>)
