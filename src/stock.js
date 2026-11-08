const base = () => process.env.STOCK_API_URL.replace(/\/$/, '');
const headers = () => ({ Authorization: `Bearer ${process.env.STOCK_API_KEY}` });
export async function getProduct(sku) {
  const r = await fetch(`${base()}/${encodeURIComponent(sku)}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`stock api ${r.status}`);
  return r.json();
}
export async function getCatalogue() {
  const r = await fetch(base(), { headers: headers(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`stock api ${r.status}`);
  const j = await r.json(); return j.products || j;
}
