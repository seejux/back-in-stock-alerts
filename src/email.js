const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (p, c) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: c || 'GBP' }).format(p); } catch { return `${p}`; } };

export function renderEmail(p) {
  const name = esc(p.name || p.sku), url = p.url ? esc(p.url) : null;
  const cta = url ? `<a href="${url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px;font-size:16px">Shop it now</a>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} is back</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="display:none;max-height:0;overflow:hidden">Good news: ${name} is back in stock.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="padding:20px 28px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Back in stock</td></tr>
${p.image ? `<tr><td><img src="${esc(p.image)}" alt="${name}" width="520" style="display:block;width:100%;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:28px">
<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25">${name} is back.</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#4b5563">You asked us to let you know when this one returned. It's available again${p.price != null ? ` at <strong style="color:#111827">${esc(money(p.price, p.currency))}</strong>` : ''}, but popular items can sell out fast.</p>
${cta}
<p style="margin:24px 0 0;font-size:12px;color:#9ca3af">SKU ${esc(p.sku)} · You're getting this one-time email because you requested a restock alert. We won't email you again about it.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${p.name || p.sku} is back in stock.${p.url ? `\n\nShop it: ${p.url}` : ''}\n\nYou requested a one-time restock alert for SKU ${p.sku}.`;
  return { subject: `Back in stock: ${p.name || p.sku}`, html, text };
}

export async function sendEmail({ to, product, key }) {
  const { subject, html, text } = renderEmail(product);
  const r = await fetch(`${process.env.RESEND_BASE_URL.replace(/\/$/, '')}/emails`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Restock Alerts <alerts@example.com>', to: [to], subject, html, text }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`email ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.id || null;
}
