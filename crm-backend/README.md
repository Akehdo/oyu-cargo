## CRM Backend

NestJS + Prisma backend for the CRM project.

### Stack

- TypeScript
- NestJS
- Prisma
- PostgreSQL
- Redis
- JWT access tokens + rotating refresh tokens
- Telegram audit notifications and daily issued-parcel report

### Modular layout

```text
src/
  config/      env parsing
  modules/
    auth/      login/refresh/logout, JWT, refresh token storage
    users/     user persistence
    parcels/   parcel CRUD/status workflows
    records/   record creation
    clients/   client portal API (/client/*) and CRM client lookups (/clients/*)
  telegram/    group notifications and scheduled reports
  generated/   generated Prisma Client
  prisma/      Prisma client provider
  redis/       Redis provider
```

### Quick start

Create a local env file:

```powershell
Copy-Item .env.local.example .env
```

Or on Unix-like shells:

```bash
cp .env.local.example .env
```

Then run:

```bash
npm install
npm run db:setup
npm run start:dev
```

`db:setup` applies Prisma migrations and seeds the login user from:

```text
SEED_ADMIN_EMAIL
SEED_ADMIN_PASSWORD
SEED_ADMIN_OVERWRITE
```

Change `SEED_ADMIN_PASSWORD` before running Docker on a server. Existing users are not
updated by seed unless `SEED_ADMIN_OVERWRITE=true`, so a container restart will not
silently reset the admin password.

For existing databases that were created with `prisma db push` before migrations were
added, mark the first migration as already applied after verifying the schema:

```bash
npx prisma migrate resolve --applied 20260705110423_first_migration
npx prisma migrate deploy
```

For migration diff checks against migration history, create a separate local shadow
database and set `SHADOW_DATABASE_URL`.

### Tests

`npm test` runs typecheck and unit tests. Issuance consistency (record tracks, parcel status
restore, split payments) is tested against a real database: point `TEST_DATABASE_URL` at a
disposable, migrated PostgreSQL database and run `npm test` again; without it those tests are
skipped.

### Local Docker Compose

From `crm-backend`, using the existing `.env`:

```bash
docker compose up -d --build
```

Open `http://localhost:8081` (or the port in `FRONTEND_PORT`). The default stack
runs HTTP with nginx API rate limits, binds only to localhost, and does not need
a domain, certificate, or Certbot. PostgreSQL and Redis data remain in volumes.

### Production with Docker Compose

On the production Linux server, set
`COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml` in its `.env`.
Keep this setting out of the local `.env`. Docker Compose >= 2.24.4 is required.

The Compose stack builds production images, runs the React bundle behind nginx, and exposes
only the frontend on the host. The API, Postgres, and Redis are reachable only through the
internal Docker network.

Keep `crm-backend`, `crm-frontend`, and `crm-client` next to each other. On a new server,
prepare a private `.env` in `crm-backend` using the variables in the Compose files:

```bash
cd crm-backend
touch .env
chmod 600 .env
nano .env
```

Fill every empty value. Use the public IP or domain in `CORS_ALLOWED_ORIGINS`, including the
scheme and port when it is not the default one. Hex secrets avoid URL-escaping problems in
the generated PostgreSQL connection string:

```bash
openssl rand -hex 32
```

Validate and start the stack:

```bash
docker compose config --quiet
docker compose up -d --build --remove-orphans
docker compose ps
```

Docker nginx owns public ports 80 and 443. Before the first certificate is issued,
only health and ACME are served. Follow [HTTPS and rate-limit setup](docs/nginx-https.md)
to issue one certificate for `oyu-cargo.online` and `www.oyu-cargo.online`
and enable automatic renewal. The www host redirects to the canonical site.
After setup, nginx serves the frontend and proxies `/api/*` to the backend:

```bash
curl -I http://127.0.0.1/health
curl https://oyu-cargo.online/api/health
```

Useful operational commands:

```bash
docker compose logs -f --tail=100
docker compose up -d --build --remove-orphans
docker compose down
```

`docker compose down` preserves database volumes. Do not add `-v` on a production server
unless the persistent Postgres and Redis data really must be deleted.

Allow ports 80 and 443 in the server and cloud firewalls. Set
`CORS_ALLOWED_ORIGINS=https://oyu-cargo.online`. See the HTTPS guide before replacing
an existing host nginx: its ports must be released during the switch.

### Telegram notifications

For automated PostgreSQL backups on the server or in Google Drive, see [the backup setup guide](docs/backups-google-drive.md).

Create a bot with `@BotFather`, add it to the target group, and allow it to send messages.
Then add these values to the backend `.env` file:

```text
TELEGRAM_BOT_TOKEN=123456789:your-bot-token
TELEGRAM_CHAT_ID=-1001234567890
```

For a group or supergroup, `TELEGRAM_CHAT_ID` is usually a negative number. Restart the app
after changing the environment:

```bash
docker compose up -d --build
```

The bot logs issuance creation, updates and deletion, expenses, cash-register transfers,
parcel imports, and parcel status changes. Each issuance notification contains its full list
of track numbers. The production stack sends a report at 20:00 in `Asia/Qyzylorda`
for the current date, containing the parcel count and a single combined list of tracks
issued up to that moment, one per line, without client or issuance details. Local Compose
disables daily reports to avoid messages from the local database using the same bot.
Outside Compose, enable them with `TELEGRAM_DAILY_REPORT_ENABLED=true`.
Report generation outside 20:00 is skipped, and generation/delivery results are logged.
If either Telegram setting is empty, all CRM
operations continue normally and notifications stay disabled.

#### Client notifications and the Mini App (same bot)

The same bot also talks to cargo clients in private chats; there is no second bot
and no e-mail. Staff reports still go only to `TELEGRAM_CHAT_ID`.

1. In `@BotFather`: `/newapp` (or *Bot Settings → Configure Mini App*) with the URL
   `https://oyu-cargo.online/`. The backend also sets the chat menu button to this URL.
2. Add to the production `.env`:

   ```text
   TELEGRAM_WEBHOOK_SECRET=<random 32+ chars, A-Z a-z 0-9 _ ->
   # Optional, these are the production defaults:
   # TELEGRAM_WEBHOOK_URL=https://oyu-cargo.online/api/telegram/webhook
   # TELEGRAM_MINI_APP_URL=https://oyu-cargo.online/
   # TELEGRAM_BOT_USERNAME=oyu_cargo_bot   # otherwise read with getMe
   ```

3. Restart the app. On start it calls `setWebhook` (with the secret), `setMyCommands`
   and `setChatMenuButton`.

How clients connect: opened from the bot, the cabinet signs in by itself once the
Telegram account is linked; on first use the client logs in or registers and the
account links automatically. In a browser, *Профиль → Подключить Telegram* gives a
one-time `t.me/<bot>?start=<token>` link (15 minutes). `/stop` in the bot unlinks.

Status changes and pickup reminders are written to `notifications` inside the CRM
transactions; every 15 seconds the app delivers new rows created after the link
(at most 3 days old, up to 5 attempts), one grouped message per client. A client who
blocks the bot is unlinked automatically.

Local Compose never sets the webhook, menu or commands and does not message clients,
because the bot is shared with production. To test the bot locally, use a separate
test bot token with `TELEGRAM_POLLING=true` and `TELEGRAM_CLIENT_NOTIFICATIONS_ENABLED=true`
outside Compose — polling deletes the webhook of the bot it runs on.

### Users and roles

One `users` table holds everyone:

- `admin` — CRM staff, sign in with email at `POST /auth/login`. Every CRM endpoint requires this role.
- `user` — cargo client, registers with email and phone at `POST /client/auth/register`
  and signs in with either contact at `POST /auth/login`. The client profile holds the
  random 5-digit code, name and accepted terms. Existing phone-only accounts can still sign in.

The access guard is deny-by-default: a route must declare `@AdminOnly()` or `@ClientOnly()`.
The migration `20261118000000_unified_users_client_portal` turns every existing user into
`admin`, so current CRM accounts keep working; staff must sign in again once after deploy.

Clients attach track numbers to their account (`client_tracks`). Parcel imports, status updates
and issuances create `notifications` for them, issued tracks move to the archive ("корзина"),
and a daily job at 11:00 Asia/Qyzylorda reminds about parcels waiting in Kokshetau longer than
`CLIENT_PICKUP_REMINDER_DAYS` (default 5; disable with `CLIENT_NOTIFICATIONS_CRON_ENABLED=false`).
One platform on one domain, served by the frontend nginx image: the client cabinet
(`../crm-client`) at `/` with the shared sign-in at `/login`, the admin panel at `/admin`
(admins only), and a real 404 page for unknown addresses.
Full API: [docs/client-api.md](docs/client-api.md).

### Endpoints

```http
GET /health
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET /parcels?page=1&limit=20&status=added
GET /parcels/:track_number
POST /parcels
PUT /parcels/status
POST /records
PATCH /records/:id
GET /records/:id
GET /records/track-numbers?date=2026-08-01
GET /records/by-track/:track_number
POST /transactions/transfer
GET /clients?q=
GET /clients/by-code/:code
GET /clients/by-track/:track_number
POST /clients/:id/reset-password
POST /client/auth/register | login | refresh | logout
GET /client/me
GET|POST /client/tracks, DELETE /client/tracks/:id
GET /client/notifications, POST /client/notifications/read
```

Use the selected record's `updated_at` as `expected_updated_at` when patching an
issuance. A stale version returns HTTP 409 with code `STALE_RECORD`. If the API
returns `TRACK_OWNER_CONFLICT`, confirm the client change before resubmitting
with `confirm_track_reassignment: true` (query parameter for DELETE).
Historical issuances without ledger rows return `payments: []`. Their price
and primary payment method remain on the issuance.

A cash transfer requires an `Idempotency-Key` header containing a UUID v4.
Reuse the same key and request values after an interrupted response. A replay
returns the existing expense and income rows. Reusing a key with different
values returns HTTP 409.

The canonical-track migration uppercases and trims existing track numbers. It
preserves historical receipts and financial entries when several receipts
contain the same physical track. If multiple warehouse rows or customer links
would collapse to one key, the migration aborts atomically and identifies the
track for reconciliation. A disputed owner error also identifies the receipt,
its customer code and the linked profile's code. Check the original pickup
receipt and the customer's manual tracking note before correcting the specific
receipt or link. Keep the customer's private note with its original owner.
After verifying the correction, mark the failed migration as rolled back with
`npx prisma migrate resolve --rolled-back 20261120010000_canonical_tracks_and_transfer_keys`
and retry `npx prisma migrate deploy`. Archived links with neither a receipt nor
a warehouse parcel return to the customer's active list with their notes intact.
