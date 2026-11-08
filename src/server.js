import http from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';
import { getProduct, getCatalogue } from './stock.js';
import { processSku, sweep } from './notify.js';
import { embedPage, adminPage } from './pages.js';

for (const k of ['STOCK_API_URL', 'STOCK_API_KEY', 'RESEND_API_KEY', 'RESEND_BASE_URL', 'WEBHOOK_SECRET', 'ADMIN_PASSWORD'])
  if (!process.env[k]) { console.error(`Missing env var ${k}`); process.exit(1); }

const eq = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const SKU = /^[A-Za-z0-9._\-]{1,64}$/;

const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type + (type.startsWith('text') ? '; charset=utf-8' : ''), 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const readJson = req => new Promise((ok, no) => {
  let n = 0; const ch = [];
  req.on('data', c => { n += c.length; if (n > 64 * 1024) { no(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else ch.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { no(Object.assign(new Error('invalid json'), { code: 400 })); } });
  req.on('error', no);
});

let cat = { at: 0, list: [] };
async function catalogue() {
  if (Date.now() - cat.at > 30000) { try { cat = { at: Date.now(), list: await getCatalogue() }; } catch { cat.at = Date.now() - 20000; } }
  return cat.list;
}

const insReq = db.prepare('INSERT INTO requests(email,sku,product_name) VALUES(?,?,?)');
const insEvt = db.prepare('INSERT OR IGNORE INTO events(event_id,sku) VALUES(?,?)');
const delEvt = db.prepare('DELETE FROM events WHERE event_id=?');

async function createRequest(req, res) {
  let b; try { b = await readJson(req); } catch (e) { return send(res, e.code || 400, { error: 'Invalid request.' }); }
  const email = String(b.email ?? '').trim().toLowerCase(), sku = String(b.sku ?? '').trim();
  if (email.length > 254 || !EMAIL.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
  if (!SKU.test(sku)) return send(res, 400, { error: 'Please choose a product.' });
  let p;
  try { p = await getProduct(sku); } catch { return send(res, 503, { error: 'We could not check that product right now. Please try again shortly.' }); }
  if (!p || !p.name) return send(res, 404, { error: "We couldn't find that product." });
  try {
    insReq.run(email, p.sku || sku, p.name || null);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return send(res, 200, { ok: true, duplicate: true, message: "You're already on the list for this item. We'll email you as soon as it's back." });
    throw e;
  }
  if (p.in_stock && p.quantity > 0) { processSku(p.sku || sku).catch(() => {}); return send(res, 201, { ok: true, message: "Good news, it's in stock right now! We're emailing you a link." }); }
  send(res, 201, { ok: true, message: "You're on the list. We'll email you once, as soon as it's back." });
}

async function webhook(req, res) {
  const given = req.headers['x-webhook-secret'];
  if (!given || !eq(given, process.env.WEBHOOK_SECRET)) return send(res, 401, { error: 'unauthorized' });
  let b; try { b = await readJson(req); } catch (e) { return send(res, e.code || 400, { error: 'bad payload' }); }
  const eventId = typeof b.event_id === 'string' || typeof b.event_id === 'number' ? String(b.event_id) : null;
  const sku = typeof b.sku === 'string' && SKU.test(b.sku) ? b.sku : null;
  if (!eventId || !sku) return send(res, 400, { error: 'event_id and sku required' });
  // Atomic dedupe: only the first delivery of an event_id inserts.
  if (insEvt.run(eventId, sku).changes === 0) return send(res, 200, { ok: true, duplicate: true });
  try {
    await processSku(sku); // verifies real stock before any email
    send(res, 200, { ok: true });
  } catch (e) {
    delEvt.run(eventId); // let the sender's retry reprocess this event
    console.error('webhook', eventId, e.message);
    send(res, 503, { error: 'temporarily unavailable' });
  }
}

async function admin(req, res, url) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  const pass = m ? Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':') : '';
  if (!m || !eq(pass, process.env.ADMIN_PASSWORD)) return send(res, 401, 'Authentication required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="Admin", charset="UTF-8"' });
  const q = { q: (url.searchParams.get('q') || '').slice(0, 100), status: url.searchParams.get('status') || '' };
  const where = [], args = [];
  if (['open', 'sending', 'notified'].includes(q.status)) { where.push('status=?'); args.push(q.status); }
  if (q.q) { where.push(`(email LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\' OR product_name LIKE ? ESCAPE '\\')`); const l = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`; args.push(l, l, l); }
  const rows = db.prepare(`SELECT * FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`).all(...args);
  const s = db.prepare(`SELECT COUNT(*) total, SUM(status!='notified') open, SUM(status='notified') notified, COUNT(DISTINCT sku) skus FROM requests`).get();
  send(res, 200, adminPage(rows, { total: s.total, open: s.open || 0, notified: s.notified || 0, skus: s.skus }, q), 'text/html', { 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const r = `${req.method} ${url.pathname.replace(/(.)\/$/, '$1')}`;
    if (r === 'GET /embed') return send(res, 200, embedPage(await catalogue(), url.searchParams.get('sku') || ''), 'text/html', { 'Content-Security-Policy': 'frame-ancestors *' });
    if (r === 'POST /api/requests') return await createRequest(req, res);
    if (r === 'POST /webhooks/stock') return await webhook(req, res);
    if (r === 'GET /admin') return await admin(req, res, url);
    if (r === 'GET /healthz') return send(res, 200, { ok: true });
    if (r === 'GET /') { res.writeHead(302, { Location: '/embed' }); return res.end(); }
    send(res, 404, { error: 'not found' });
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'internal error' }); }
});

const port = process.env.PORT || 8080;
server.listen(port, '0.0.0.0', () => console.log(`listening on ${port}`));
setInterval(() => sweep().catch(e => console.error('sweep', e.message)), 30000).unref();
sweep().catch(() => {});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
