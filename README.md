# Wix ↔ HubSpot Integration

Wix CLI app (Astro 5 + Cloudflare) for bi-directional contact sync and form lead capture with HubSpot.

## Features

- **Bi-directional contact sync** — Wix ↔ HubSpot with configurable field mappings
- **Loop prevention** — Deduplication window, correlation IDs, idempotency
- **Conflict resolution** — Last-updated-wins, HubSpot-wins, or Wix-wins
- **Form lead capture** — Wix form submissions → HubSpot contacts with UTM attribution
- **OAuth 2.0** — Secure HubSpot connect/disconnect from Wix dashboard
- **Field mapping UI** — Wix field ↔ HubSpot property table with direction & transforms

## Tech Stack

| Component       | Technology                                 |
| --------------- | ------------------------------------------ |
| Framework       | Astro 5 (SSR)                              |
| Hosting         | Cloudflare Workers (`@astrojs/cloudflare`) |
| Wix Integration | `@wix/astro` (self-hosted CLI app)         |
| Dashboard UI    | React + `@wix/design-system`               |
| Data Storage    | Wix CMS Data Collections (`@wix/data`)     |
| Secrets         | Wix Secrets Manager (`@wix/secrets`)       |
| HubSpot         | CRM Contacts API v3 + OAuth 2.0            |

## Setup

1. Create a new Wix app with the CLI, copy `src/`, `package.json`, `astro.config.mjs` into it
2. Run `npm install`
3. Copy `.env.example` → `.env.local` and fill in your credentials
4. Enable Dev Mode on your test site (see setup guide)
5. `npm run dev` — starts Astro + Wix CLI tunnel
6. Open the app in Wix dashboard → **Connection** page → **Connect to HubSpot**
7. Configure field mappings → Save

## Deploy

```bash
wix release
```

Update `HUBSPOT_REDIRECT_URI` in Wix Secrets Manager to your production callback URL.

## Documentation

- [setup.md](setup.md) — Full setup guide with step-by-step instructions
