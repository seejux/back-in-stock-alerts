import { db } from './db.js';
import { getProduct } from './stock.js';
import { sendEmail } from './email.js';

const claim = db.prepare(`UPDATE requests SET status='sending', claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), attempts=attempts+1 WHERE id=? AND status='open'`);
const done = db.prepare(`UPDATE requests SET status='notified', notified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), email_id=?, last_error=NULL WHERE id=? AND status='sending'`);
const release = db.prepare(`UPDATE requests SET status='open', last_error=? WHERE id=? AND status='sending'`);
const openFor = db.prepare(`SELECT id,email FROM requests WHERE sku=? AND status='open' ORDER BY id`);
const reclaim = db.prepare(`UPDATE requests SET status='open' WHERE status='sending' AND claimed_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')`);
const skusOpen = db.prepare(`SELECT DISTINCT sku FROM requests WHERE status='open'`);

const running = new Map(); // coalesce concurrent runs per SKU in-process
export function processSku(sku) {
  if (running.has(sku)) return running.get(sku).then(() => processSku(sku));
  const p = run(sku).finally(() => running.delete(sku));
  running.set(sku, p); return p;
}

async function run(sku) {
  // Source of truth is the stock API, never the webhook payload.
  const product = await getProduct(sku);
  if (!product || !(product.in_stock && product.quantity > 0)) return 0;
  let sent = 0;
  for (const r of openFor.all(sku)) {
    if (claim.run(r.id).changes !== 1) continue; // someone else owns it
    try {
      // Idempotency-Key = request id: a retry after a crash can't produce a second email.
      const id = await sendEmail({ to: r.email, product, key: `bis-${r.id}` });
      done.run(id, r.id); sent++;
    } catch (e) { release.run(String(e.message).slice(0, 300), r.id); }
  }
  return sent;
}

// Safety net: recovers crashed sends and missed/failed webhooks.
export async function sweep() {
  reclaim.run();
  for (const { sku } of skusOpen.all()) { try { await processSku(sku); } catch (e) { console.error('sweep', sku, e.message); } }
}
