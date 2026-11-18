# CRM Frontend

React frontend for the parcel CRM.

## Run

```bash
npm install
npm run dev
```

The app starts at:

```text
http://127.0.0.1:5173
```

Backend API defaults to:

```text
/api
```

To override it, create `.env`:

```env
VITE_API_URL=/api
```

For local Vite development without nginx proxy, use:

```env
VITE_API_URL=http://localhost:8080
```

## Docker

The production image builds static assets and serves them with nginx:

```bash
docker build -t crm-frontend .
docker run --rm -p 3000:80 crm-frontend
```

The local Compose stack is managed from `../crm-backend`, using its configured `.env`:

```bash
cd ../crm-backend
docker compose config --quiet
docker compose up -d --build --remove-orphans
```

```text
http://localhost:8081
```

The default backend Compose stack serves local HTTP at `http://localhost:8081`
with nginx API rate limits and no certificate requirement.
On the Linux server, set `COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml`
in the backend `.env`. Keep this setting out of the local `.env`.
With this production override, nginx serves HTTPS on port 443 and redirects port 80 after a certificate
is installed. Before that it serves only health and ACME on port 80. The backend
Compose stack mounts the shared Certbot volumes and configures `CRM_DOMAIN`.
See `crm-backend/docs/nginx-https.md` for issuance, renewal, and API rate limits.
Postgres, Redis, and the backend do not publish host ports in the production stack.

## Auth refresh

Next.js is not required for this flow. The important part is the client auth layer:

- tokens are restored from local storage on page reload;
- the app silently calls `/auth/refresh` on startup when a refresh token exists;
- API requests retry once after `401` by refreshing the token pair;
- concurrent `401` requests share one refresh call, so rotated refresh tokens do not race;
- UI state such as filters, drafts, theme, and search is persisted separately from auth.

For production, consider moving refresh tokens to secure HTTP-only cookies.
