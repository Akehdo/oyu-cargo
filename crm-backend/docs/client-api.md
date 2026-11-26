# Client portal API

The OYU Cargo platform — client cabinet (`crm-client`, served at `/`) and admin panel
(`crm-frontend`, served at `/admin`) — shares one backend and one sign-in.
All paths below are relative to the API base (`/api` behind nginx).

Errors use the standard Nest shape: `{ "statusCode": 400, "message": "..." }`
(`message` may be a string array for validation errors).

## Client auth

Client tokens are separate from CRM staff tokens: a client access token is rejected
by CRM endpoints and a staff token is rejected by client endpoints.

### `POST /client/auth/register`

```json
{
  "name": "Айгерим",
  "email": "aigerim@example.com",
  "phone": "+7 701 123 45 67",
  "password": "min 6 chars",
  "accept_terms": true,
  "terms_version": "2026-11-18",
  "existing_code": 54321
}
```

- Email and phone are required for new accounts. Email is trimmed and lowercased.
- A Kazakhstani mobile number is stored as `+7XXXXXXXXXX`. For example, `8 701 123 45 67`, `77011234567`, and `+7 (701) 123-45-67` all become `+77011234567`. Use only the digits for a WhatsApp link, as in `https://wa.me/77011234567`.
- Send the JSON boolean `true` and the version displayed to the client. A missing or stale version returns 409 with `error.code = TERMS_VERSION_MISMATCH`. Reload the published terms before submitting again.
- `existing_code` is optional. Without it a unique random 5-digit client code (10000–99999)
  is assigned; codes already used in CRM issuances are skipped.
- With `existing_code` (10000–99999) a client who already had a code keeps it. The code must
  not belong to another account, otherwise `409` with `error.code = CLIENT_CODE_TAKEN`.
  Parcels staff issued to that code before signup are added to the client's archive
  (tracks another account holds are left alone). The profile gets `code_source = existing`,
  shown in the CRM card so staff can check the claim: the code itself is not verified.
- A phone or email that is already in use returns `409` with `error.code = CONTACT_ALREADY_REGISTERED`.

Response `201`: `TokenPair` plus the assigned `client_code`.

### `POST /auth/login`

`{ "login": "aigerim@example.com", "password": "..." }` → `200 TokenPair`, `401` on bad credentials. The `login` field accepts a client email, a client phone number or an administrator email. Clients with an existing phone-only account can still sign in using their phone.

Existing API clients can continue using `POST /client/auth/login` with `{ "phone": "...", "password": "..." }` for client accounts and `POST /auth/login` with `{ "email": "...", "password": "..." }` for administrators.

### `POST /client/auth/refresh`

`{ "refresh_token": "..." }` → `200 TokenPair` (old refresh token is consumed).

### `POST /client/auth/logout`

`{ "refresh_token": "..." }` → `200 { "message": "logged out successfully" }`.

`TokenPair`:

```json
{ "access_token": "jwt", "refresh_token": "opaque" }
```

All endpoints below require `Authorization: Bearer <client access token>`.

## Profile and statistics

### `GET /client/me`

```json
{
  "id": "uuid",
  "code": 48213,
  "name": "Айгерим",
  "phone": "+77011234567",
  "code_source": "generated",
  "telegram": { "enabled": true, "linked": true, "username": "aigerim" },
  "created_at": "2026-11-18T10:00:00.000Z",
  "stats": {
    "tracks_total": 12,
    "tracks_active": 3,
    "tracks_issued": 9,
    "issued_weight_kg": 23.4,
    "issuances_count": 5,
    "total_spent": 45630
  },
  "loyalty": {
    "level": "silver",
    "label": "Серебро",
    "next_level_label": "Золото",
    "next_level_weight_kg": 100,
    "progress_percent": 23
  }
}
```

`loyalty.level` is one of `start`, `bronze`, `silver`, `gold`; `next_level_*` are `null`
at the top level. Levels are based on issued kilograms.

## Tracks

Track status values:

| status     | meaning for the client             |
|------------|------------------------------------|
| `pending`  | added by the client, not yet in CRM |
| `added`    | received at the China warehouse    |
| `shipped`  | on the way                         |
| `almaty`   | arrived in Almaty                  |
| `koksh`    | arrived in Kokshetau, ready for pickup |
| `issued`   | handed over to the client          |

`ClientTrack`:

```json
{
  "id": "uuid",
  "track_number": "YT1234567890",
  "comment": "кроссовки",
  "status": "almaty",
  "status_updated_at": "2026-11-17T09:00:00.000Z",
  "archived": false,
  "archived_at": null,
  "created_at": "2026-11-10T08:00:00.000Z"
}
```

### `GET /client/tracks?archived=false|true&page=1&limit=20`

`{ "items": ClientTrack[], "meta": { "page": 1, "limit": 20, "total": 42, "total_pages": 3 } }`, newest first. Explicit limits range from 1 to 100. Requests without either pagination parameter retain the original 500-item page. `archived=true` returns the "корзина":
tracks that were issued. Issued tracks are never deleted.

### `POST /client/tracks`

`{ "track_number": "YT123", "comment": "optional, up to 100 chars" }` → `201 ClientTrack`.

- `409` when the track is already linked to this or another client.
- A track that is already issued goes straight to the archive.

### `DELETE /client/tracks/:id`

Removes a mistaken track that is not issued yet. `400` for archived/issued tracks.

## Notifications

Created by the backend when a linked parcel changes status, and daily when a parcel
has been waiting for pickup in Kokshetau for several days.

`ClientNotification`:

```json
{
  "id": "uuid",
  "type": "status_changed",
  "title": "Посылка прибыла в Алматы",
  "body": "YT1234567890 (кроссовки)",
  "track_number": "YT1234567890",
  "read": false,
  "created_at": "2026-11-17T09:00:00.000Z"
}
```

`type` is `status_changed` or `pickup_reminder`.

### `GET /client/notifications?limit=50`

`{ "items": ClientNotification[], "unread_count": 2 }`, newest first.

### `POST /client/notifications/read`

`{ "ids": ["uuid"] }` marks the given ones as read; `{}` marks all as read.
→ `200 { "unread_count": 0 }`.

## Telegram

The OYU Cargo bot (the same one that posts staff reports) delivers `ClientNotification`s
to clients who linked Telegram, and opens the cabinet as a Mini App. `telegram.enabled`
in `/client/me` is `false` when the bot is not configured.

### `POST /client/auth/telegram` (public)

`{ "init_data": "<Telegram.WebApp.initData>" }` → `200 TokenPair` for the client linked to
this Telegram account. `404` with `error.code = TELEGRAM_NOT_LINKED` if none;
`401` with `TELEGRAM_INIT_DATA_INVALID` for a bad signature or initData older than 24 h.

### `GET /client/telegram`

`{ "enabled": true, "linked": false, "username": null, "linked_at": null }`.

### `POST /client/telegram/link`

`{ "init_data": "..." }` from inside the Mini App: links that Telegram account to the
signed-in client. One Telegram account belongs to one cabinet: linking moves it.

### `POST /client/telegram/link-url`

→ `{ "url": "https://t.me/<bot>?start=<token>", "expires_in": 900 }` for a browser
session. The link is one-time; pressing *Start* in the bot links the account.

### `DELETE /client/telegram`

Unlinks; the bot command `/stop` does the same.

### `POST /telegram/webhook`

Telegram updates. Requires the `X-Telegram-Bot-Api-Secret-Token` header equal to
`TELEGRAM_WEBHOOK_SECRET`; only private chats are handled.

## CRM endpoints (staff token)

- `GET /clients?q=&page=&limit=` — search registered clients by code, phone or name.
- `GET /clients/by-code/:code` — client card: profile (or `null` for an unregistered
  code that only exists in issuances), stats, active tracks, archived tracks, issuances.
- `GET /clients/by-track/:track_number` — the client who added the track.
- `POST /clients/:id/reset-password` — sets and returns a new temporary password.
