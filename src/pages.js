export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = `:root{--bg:#fff;--fg:#111827;--mut:#6b7280;--bd:#e5e7eb;--ac:#111827;--acf:#fff;--ok:#047857;--bad:#b91c1c;--sf:#f9fafb}
@media(prefers-color-scheme:dark){:root{--bg:#111418;--fg:#f3f4f6;--mut:#9ca3af;--bd:#2a2f36;--ac:#f3f4f6;--acf:#111418;--ok:#34d399;--bad:#f87171;--sf:#181c21}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}`;

export const embedPage = (skus, preset) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back in stock alerts</title>
<style>${base}
.w{max-width:440px;margin:0 auto;padding:20px}h1{font-size:19px;margin:0 0 4px}p.s{color:var(--mut);margin:0 0 18px;font-size:14px}
label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}.f{margin-bottom:14px}
input,select{width:100%;padding:12px;font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--bd);border-radius:10px}
input:focus,select:focus,button:focus-visible{outline:2px solid var(--ac);outline-offset:1px}
button{width:100%;padding:13px;font:inherit;font-weight:600;border:0;border-radius:10px;background:var(--ac);color:var(--acf);cursor:pointer}button:disabled{opacity:.6;cursor:wait}
#m{margin-top:14px;padding:12px;border-radius:10px;font-size:14px;display:none}#m.ok{display:block;background:var(--sf);color:var(--ok);border:1px solid var(--ok)}#m.err{display:block;background:var(--sf);color:var(--bad);border:1px solid var(--bad)}</style></head>
<body><div class="w"><h1>Get notified when it's back</h1><p class="s">Tell us which item you want. We'll send one email the moment it's available again.</p>
<form id="f" novalidate><div class="f"><label for="e">Email</label><input id="e" type="email" name="email" autocomplete="email" placeholder="you@example.com" required></div>
<div class="f"><label for="s">Product</label>${skus.length ? `<select id="s" name="sku" required><option value="">Choose a product…</option>${skus.map(p => `<option value="${esc(p.sku)}"${p.sku === preset ? ' selected' : ''}>${esc(p.name || p.sku)}${p.in_stock ? '' : ' (sold out)'}</option>`).join('')}</select>` : `<input id="s" name="sku" value="${esc(preset)}" placeholder="SKU" required>`}</div>
<button id="b">Notify me</button><div id="m" role="status" aria-live="polite"></div></form></div>
<script>const f=document.getElementById('f'),m=document.getElementById('m'),b=document.getElementById('b');
function show(c,t){m.className=c;m.textContent=t}
f.addEventListener('submit',async ev=>{ev.preventDefault();show('','');b.disabled=true;b.textContent='Saving…';
try{const r=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value.trim(),sku:f.sku.value.trim()})});
const j=await r.json().catch(()=>({}));
if(r.ok){show('ok',j.message||"You're on the list.");f.email.value=''}else show('err',j.error||'Something went wrong. Please try again.')}
catch{show('err','Network problem. Please try again.')}b.disabled=false;b.textContent='Notify me'});</script></body></html>`;

export const loginHint = 'Authentication required';

export function adminPage(rows, stats, q) {
  const badge = s => `<span class="b ${s}">${s === 'open' ? 'Waiting' : s === 'sending' ? 'Sending' : 'Notified'}</span>`;
  const t = v => v ? esc(new Date(v).toISOString().replace('T', ' ').slice(0, 19)) + ' UTC' : '<span class="m">·</span>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restock alerts · Admin</title>
<style>${base}
main{max-width:1050px;margin:0 auto;padding:28px 16px 60px}h1{font-size:22px;margin:0 0 18px}.m{color:var(--mut)}
.st{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px}.c{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:14px}.c b{display:block;font-size:26px}
form{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}input,select,button{font:inherit;padding:9px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg)}input{flex:1;min-width:180px}button{background:var(--ac);color:var(--acf);border:0;font-weight:600;cursor:pointer}
.tw{overflow-x:auto;border:1px solid var(--bd);border-radius:12px}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--bd);font-size:14px;vertical-align:top}th{background:var(--sf);font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}tr:last-child td{border:0}
.b{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid var(--bd)}.b.notified{color:var(--ok);border-color:var(--ok)}.b.sending{color:#b45309;border-color:#b45309}.b.open{color:var(--mut)}
.er{color:var(--bad);font-size:12px;margin-top:2px}</style></head><body><main>
<h1>Back-in-stock requests</h1>
<div class="st"><div class="c"><b>${stats.total}</b><span class="m">Total</span></div><div class="c"><b>${stats.open}</b><span class="m">Waiting</span></div><div class="c"><b>${stats.notified}</b><span class="m">Notified</span></div><div class="c"><b>${stats.skus}</b><span class="m">Products</span></div></div>
<form method="get"><input name="q" value="${esc(q.q)}" placeholder="Search email, SKU or product"><select name="status"><option value="">All statuses</option>${['open', 'sending', 'notified'].map(s => `<option value="${s}"${q.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select><button>Filter</button></form>
<div class="tw"><table><thead><tr><th>Email</th><th>Product</th><th>Status</th><th>Requested</th><th>Notified</th></tr></thead><tbody>
${rows.length ? rows.map(r => `<tr><td>${esc(r.email)}</td><td>${esc(r.product_name || r.sku)}<div class="m" style="font-size:12px">${esc(r.sku)}</div></td><td>${badge(r.status)}${r.last_error ? `<div class="er">${esc(r.last_error)}</div>` : ''}</td><td>${t(r.created_at)}</td><td>${t(r.notified_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="m" style="padding:30px;text-align:center">No requests yet.</td></tr>'}
</tbody></table></div><p class="m">Showing latest ${rows.length}. Auto-refreshes every 15s.</p></main><script>setTimeout(()=>location.reload(),15000)</script></body></html>`;
}
