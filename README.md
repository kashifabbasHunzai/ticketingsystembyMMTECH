# FANAN Tickets (AKYSB Rawalpindi)
React + Firebase (free Spark plan). Pages: `/` booking, `#/t/<id>` ticket, `#/admin` admin (list, desk sale, gate scan).

## Setup (one time)
1. console.firebase.google.com -> new project (use the organization's email). Add a Web app, copy the config.
2. Build > Firestore Database > Create (production mode).
3. Build > Authentication > Email/Password > enable. Add users (admin + desk volunteers).
4. Firestore > Rules: paste `firestore.rules`, replace the emails in `admin()` with your admin emails, Publish.
5. `cp .env.example .env` and fill the 4 values. Edit event details in `src/config.js` (date, price).
6. `npm install` then `npm run dev` to test, `npm run build` to create `dist/`.
7. Host `dist/` free: Firebase Hosting, Cloudflare Pages or Netlify.
8. Open `#/admin`, login, click "Set up event (400 tickets)" once.

## Flow
Public books -> pending -> admin Approve -> "Send on WhatsApp" -> user opens ticket link -> gate scans QR (Valid / Already used).
Reject frees the seats. Desk sale creates a confirmed ticket directly.
