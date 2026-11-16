// CSV helpers. Blocks spreadsheet formula injection (a name like =HYPERLINK(...) becomes plain text).
const SAFE = /^="[0-9A-Za-z+\-\s]*"$/
export const cell = c => { let s = String(c ?? ''); if (/^[=+\-@\t\r]/.test(s) && !SAFE.test(s)) s = "'" + s; return `"${s.replace(/"/g,'""')}"` }
export const txt = v => v ? `="${String(v).replace(/[^0-9A-Za-z+\-\s]/g,'')}"` : ''
