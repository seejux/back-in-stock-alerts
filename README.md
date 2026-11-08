# Back-in-Stock Alerts

Zero-dependency Node 24 app (built-in `node:sqlite`). Endpoints: `GET /embed`, `POST /api/requests`, `POST /webhooks/stock`, `GET /admin` (HTTP Basic, any user + `ADMIN_PASSWORD`), `GET /healthz`.

## Run
```
docker build -t bis .
docker run -p 8080:8080 -e PORT=8080 -v bis-data:/data \
  -e STOCK_API_URL=... -e STOCK_API_KEY=... -e RESEND_API_KEY=... \
  -e RESEND_BASE_URL=... -e WEBHOOK_SECRET=... -e ADMIN_PASSWORD=... bis
```
Optional: `PORT` (default 8080), `DATA_DIR` (default `/data`; mount a volume to survive redeploys), `MAIL_FROM`.
Locally: copy values into `.env`, `npm start` (Node 24+).

## No duplicate or missed emails
- **Untrusted webhook:** constant-time check of `X-Webhook-Secret`; payload is validated, and the *stock API* (not the payload's quantity) decides whether to send.
- **Duplicate deliveries:** `event_id` is inserted into a PRIMARY KEY table; only the first delivery proceeds, so simultaneous copies are no-ops.
- **Duplicate requests:** a partial unique index on `(email, sku)` for non-notified rows; emails are lowercased.
- **Exactly-once send:** each request is claimed with an atomic `UPDATE ... WHERE status='open'` (open → sending → notified). Only the winner sends. The email carries `Idempotency-Key: bis-<request id>`, so a retry can't double-send.
- **No lost emails:** if a send fails, the row returns to `open`; if the webhook handler fails the event id is released so the sender's retry reprocesses it. A 30s sweeper re-checks every SKU with open requests (covers missed webhooks) and reclaims rows stuck in `sending` after a crash.
- **Restarts:** all state is in SQLite (WAL) on `DATA_DIR`.
