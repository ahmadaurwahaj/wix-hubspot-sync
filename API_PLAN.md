# API Plan — Wix ↔ HubSpot Integration

## Architecture Overview

This is a **Wix CLI app** built with **Astro 5 + Cloudflare adapter** (`@wix/astro`). It runs as a self-hosted app that connects to the Wix platform and HubSpot via their respective APIs.

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5 (SSR, `output: "server"`) |
| Hosting | Cloudflare Workers (via `@astrojs/cloudflare`) |
| Data Storage | **Wix CMS Data Collections** (`@wix/data` items API) |
| Secrets | **Wix Secrets Manager** (`@wix/secrets`) with `import.meta.env` fallback for local dev |
| Auth (Wix SDK) | `@wix/essentials` `auth.elevate()` for elevated CMS access in middleware-protected routes |
| Auth (OAuth callback) | Direct `@wix/sdk` `AppStrategy` client (no middleware context needed) |
| Dashboard UI | React + `@wix/design-system` in Wix dashboard iframes |
| Events | Wix CLI backend extensions (`wixForms_onFormSubmitted`, `wixContacts_onContactCreated/Updated`) |

### App Identity

| Key | Value |
|-----|-------|
| App ID | `2b468278-75a7-4a5d-94b8-2c82ad42fa6e` |
| App Namespace | `@zohaibahmad7/wh-integration` |
| Instance ID | Set via `WIX_CLIENT_INSTANCE_ID` |

---

## Data Storage — Wix CMS Data Collections

All app data is stored in **Wix CMS Data Collections** defined as CLI extensions. No external database (Turso, SQLite, etc.) is used.

### Collections

| Collection | Namespace ID | Purpose |
|-----------|-------------|---------|
| HubSpot Connections | `@zohaibahmad7/wh-integration/connections` | OAuth tokens, account info, connection status |
| Field Mappings | `@zohaibahmad7/wh-integration/field-mappings` | Wix ↔ HubSpot field mapping configuration |
| Sync Mappings | `@zohaibahmad7/wh-integration/sync-mappings` | `wixContactId ↔ hubspotContactId` mapping |
| Sync Logs | `@zohaibahmad7/wh-integration/sync-logs` | Audit trail of all sync operations |

**Important**: All API calls must use the **full namespaced ID** (e.g., `@zohaibahmad7/wh-integration/connections`), not the bare `idSuffix`.

### Permissions

All collections have **Admin-only** (PRIVILEGED) permissions for read, insert, update, and remove. Backend code uses `auth.elevate()` to access them.

### Data Access Patterns

- **Routes under `/api/`** — The `@wix/astro` auth middleware provides `AsyncLocalStorage` context. Use `auth.elevate()` from `@wix/essentials` to wrap `@wix/data` items API calls for elevated CMS access.
- **Routes under `/_wix/extensions/`** — The auth middleware SKIPS these paths. Use a direct SDK client created with `AppStrategy` (passing `appId`, `appSecret`, `instanceId`, `publicKey`) to perform CMS reads/writes.

### Extension Definition

Collections are defined in `src/extensions/data/extensions.ts` and registered in `src/extensions.ts`.

---

## Secrets Management

### Wix Secrets Manager (Production)

Secrets are stored in **Wix Secrets Manager** and accessed via `@wix/secrets`:

| Secret Name | Purpose |
|------------|---------|
| `HUBSPOT_CLIENT_ID` | HubSpot OAuth app client ID |
| `HUBSPOT_CLIENT_SECRET` | HubSpot OAuth app client secret |
| `HUBSPOT_REDIRECT_URI` | OAuth callback URL (production) |
| `APP_WIX_CLIENT_ID` | Wix app client ID (alias — Wix blocks `WIX_CLIENT_*` names) |
| `APP_WIX_CLIENT_SECRET` | Wix app client secret (alias) |

### Local Development (`.env.local`)

For local dev, secrets fall back to `import.meta.env` via the `getSecret()` helper in `src/backend/utils/secrets.ts`.

Required `.env.local` variables: `WIX_CLOUD_PROVIDER`, `WIX_CLIENT_ID`, `WIX_CLIENT_INSTANCE_ID`, `WIX_CLIENT_PUBLIC_KEY`, `WIX_CLIENT_SECRET`, `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`, `APP_WIX_CLIENT_ID`, `APP_WIX_CLIENT_SECRET`.

Note: `APP_WIX_CLIENT_ID` / `APP_WIX_CLIENT_SECRET` must be added separately (same values as `WIX_CLIENT_ID` / `WIX_CLIENT_SECRET`) because custom code calls `getSecret('APP_WIX_CLIENT_ID')`, and the env fallback needs a matching key. Wix Secrets Manager blocks names starting with `WIX_CLIENT_`.

---

## Auth Middleware & Route Strategy

The `@wix/astro` integration registers an auth middleware (`order: "pre"`) that:

1. **Skips** `/_wix/extensions/*` paths entirely (no auth context)
2. **Path 1** — If `Authorization` header exists: uses `AppStrategy` with the access token → sets up `AsyncLocalStorage` with `auth` + `elevatedAuth`
3. **Path 2** — If valid `wixSession` cookie exists: uses `OAuthStrategy` with stored tokens
4. **Path 3** — Fallback: calls `generateVisitorTokens()` → sets up visitor-level context

### Route Placement Strategy

| Path Prefix | Auth Middleware | Use For |
|-------------|----------------|---------|
| `/api/*` | **Runs** — provides `AsyncLocalStorage` context | Dashboard API calls (send `Authorization` header from iframe) |
| `/_wix/extensions/*` | **Skipped** | Routes that receive external callbacks (no Wix auth available) |
| `/_wix/extensions/backoffice/*` | **Skipped** | Dashboard page iframes (managed by Wix platform) |

### Dashboard → API Authentication

Dashboard pages run in Wix iframes. The instance JWT is passed as a URL query parameter. The shared helper at `src/extensions/dashboard/lib/api.ts` extracts it and sends it as the `Authorization` header on all API calls.

---

## Feature #1 — Bi-Directional Contact Sync

### Wix Side
| API | Purpose |
|-----|---------|
| Wix Contacts REST API v4 (`/contacts/v4/contacts`) | Create, update, query, list contacts on Wix |
| Wix OAuth Token (`/oauth2/token`, client-credentials) | Obtain app-level access token for server-to-server Wix API calls |
| Wix Backend Events (`wixContacts_onContactCreated`, `onContactUpdated`) | Trigger Wix→HubSpot sync in real-time when a Wix contact changes |

### HubSpot Side
| API | Purpose |
|-----|---------|
| HubSpot CRM Contacts API v3 (`/crm/v3/objects/contacts`) | Create, update, get, search, list contacts |
| HubSpot Properties API v3 (`/crm/v3/properties/contacts`) | Fetch available contact properties for field mapping UI |
| HubSpot OAuth 2.0 (`/oauth/v1/token`) | Token exchange + refresh for secure access |
| HubSpot Access Token Info (`/oauth/v1/access-tokens/{token}`) | Retrieve portal ID after OAuth callback |
| HubSpot Webhooks (subscription API) | Real-time `contact.creation` / `contact.propertyChange` events for HubSpot→Wix sync |

### Why These APIs
- **Wix REST v4** over SDK: Runs server-side without Wix frontend context; supports app-level auth.
- **HubSpot v3 Contacts** `createOrUpdate` endpoint: Upserts by email — prevents duplicates.
- **Webhooks + polling fallback**: Webhooks for real-time HubSpot→Wix; polling as fallback when webhook registration isn't available.

### Sync Infrastructure
| Component | Implementation |
|-----------|----------------|
| ID Mapping | `sync-mappings` CMS collection — `wixContactId ↔ hubspotContactId` |
| Loop Prevention | Deduplication cache (30s window), correlation IDs, idempotency (skip identical values), sync-source tracking |
| Conflict Resolution | Configurable: last-updated-wins (default), HubSpot-wins, Wix-wins |

---

## Feature #2 — Form & Lead Capture via Wix Form Submission

### Approach: Wix Forms as UI + Push to HubSpot

When a Wix Form is submitted on the site, our app receives the `wixForms_onFormSubmitted` event and creates/updates a HubSpot contact with the form data and UTM attribution.

### APIs Used

| API / Component | Purpose |
|-----------------|---------|
| Wix Backend Events (`wixForms_onFormSubmitted`) | Capture form submission event with all field values |
| HubSpot CRM Contacts API v3 (`/crm/v3/objects/contacts`) | Create or update contact by email |

### Data Flow

1. Visitor fills out a Wix Form on the site
2. Wix triggers `wixForms_onFormSubmitted` event
3. Our event handler receives the event with `instanceId`
4. Handler extracts form fields: email, name, phone, company, custom fields
5. Handler parses UTM attribution from submission fields, `extendedFields`, and `pageUrl` query parameters
6. Handler calls `SyncService.submitFormToHubSpot()` which upserts the HubSpot contact
7. Sync log recorded with `source: 'wix_form'`

### Properties Captured

| Field | HubSpot Property | Source |
|-------|------------------|--------|
| Email | `email` | Required: `email`, `Email`, `email_address` |
| First Name | `firstname` | `firstName`, `first_name`, or parsed from `name` |
| Last Name | `lastname` | `lastName`, `last_name`, or parsed from `name` |
| Phone | `phone` | `phone`, `Phone`, `phone_number` |
| Company | `company` | `company`, `Company`, `company_name` |
| UTM Source | `utm_source` | Form fields, extendedFields, or pageUrl |
| UTM Medium | `utm_medium` | Form fields, extendedFields, or pageUrl |
| UTM Campaign | `utm_campaign` | Form fields, extendedFields, or pageUrl |
| UTM Term | `utm_term` | Form fields, extendedFields, or pageUrl |
| UTM Content | `utm_content` | Form fields, extendedFields, or pageUrl |
| Page URL | `hs_analytics_last_url` | `formSubmission.pageUrl` |
| Referrer | `hs_analytics_last_referrer` | `formSubmission.referrer` |
| Source | `hs_analytics_source` | Always set to `OFFLINE` |

---

## Security & Auth

| Concern | Implementation |
|---------|----------------|
| HubSpot OAuth 2.0 | Authorization Code flow — user grants scopes via consent screen |
| Token Refresh | Auto-refresh expired access tokens before API calls |
| Token Storage | **Wix CMS** (`connections` collection, Admin-only permissions) — never exposed to frontend |
| Secrets | **Wix Secrets Manager** (production) / `import.meta.env` (dev) — handled by `getSecret()` |
| CSRF Protection | OAuth state parameter with expiring HMAC tokens |
| Webhook Verification | HMAC-SHA256 signature validation (`X-HubSpot-Signature`) |
| Dashboard Auth | Instance JWT passed as `Authorization` header from iframe |

### OAuth Scopes Requested
`crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`, `forms`, `oauth` — minimum required for contact sync + property listing.

---

## API Routes

### Dashboard API (under `/api/` — auth middleware active)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/oauth/initiate` | POST | Start HubSpot OAuth flow |
| `/api/oauth/disconnect` | POST | Disconnect HubSpot |
| `/api/dashboard/connection` | GET | Connection status |
| `/api/dashboard/mappings` | GET/POST | Get/save field mappings |
| `/api/dashboard/sync` | GET/POST | Sync logs + trigger manual sync |
| `/api/hubspot/properties` | GET | List HubSpot contact properties |
| `/api/hubspot/webhook` | POST | Receive HubSpot webhook events |

### External Callbacks (under `/_wix/extensions/` — auth middleware skipped)

| Route | Method | Purpose |
|-------|--------|---------|
| `/_wix/extensions/hubspot-callback` | GET | HubSpot OAuth callback (uses direct `AppStrategy` client for CMS writes) |

### Why Two Route Prefixes

The `@wix/astro` auth middleware calls `generateVisitorTokens()` as a fallback for unauthenticated requests. This fails in dev mode and for external callbacks (HubSpot redirect has no Wix auth). By placing the OAuth callback under `/_wix/extensions/`, the middleware is skipped entirely. All other routes are under `/api/` where the middleware provides `AsyncLocalStorage` context for `auth.elevate()`.

---

## Backend Event Extensions

Registered in `src/extensions.ts` and run in the Wix backend runtime (have native `auth.elevate()` context).

| Event | Handler File | Purpose |
|-------|-------------|---------|
| `wixForms_onFormSubmitted` | `extensions/backend/events/form-submitted/` | Push form data + UTM to HubSpot |
| `wixContacts_onContactCreated` | `extensions/backend/events/contact-created/` | Sync new Wix contact → HubSpot |
| `wixContacts_onContactUpdated` | `extensions/backend/events/contact-updated/` | Sync updated Wix contact → HubSpot |

---

## Dashboard Pages

| Page | Extension File | Purpose |
|------|---------------|---------|
| Overview | `my-page/` | App landing page |
| Connection | `connection/` | Connect/disconnect HubSpot account |
| Field Mapping | `field-mapping/` | Configure Wix ↔ HubSpot field mappings |
| Sync Status | `sync-status/` | View sync logs and trigger manual sync |

---

## Project Structure

- **`src/extensions.ts`** — App entry point, registers all extensions
- **`src/extensions/data/extensions.ts`** — CMS collection definitions (4 collections)
- **`src/extensions/backend/events/`** — Event handlers (form-submitted, contact-created, contact-updated)
- **`src/extensions/dashboard/lib/api.ts`** — Shared helpers: `getInstanceId()`, `apiFetch()`
- **`src/extensions/dashboard/pages/`** — 4 dashboard pages (React + Wix Design System)
- **`src/pages/api/`** — API routes (auth middleware active): dashboard/, hubspot/, oauth/
- **`src/pages/_wix/extensions/hubspot-callback.ts`** — OAuth callback (injected via astro.config.mjs)
- **`src/backend/services/`** — database.service.ts, hubspot.service.ts, sync.service.ts, wix-contacts.service.ts
- **`src/backend/types/models.ts`** — TypeScript interfaces
- **`src/backend/utils/`** — secrets.ts, logger.ts, oauth-state.ts, token-manager.ts

---

## Setup Instructions

### 1. Install Dependencies
Run `npm install` in the project root.

### 2. Configure `.env.local` (Local Development)
Create a `.env.local` file with all required variables listed in the Secrets Management section above. Set `HUBSPOT_REDIRECT_URI` to `http://localhost:4321/_wix/extensions/hubspot-callback` for local dev.

### 3. Configure Wix Secrets Manager (Production)
Add these secrets in your Wix dashboard under **Developer Tools → Secrets Manager**: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI` (production callback URL), `APP_WIX_CLIENT_ID`, `APP_WIX_CLIENT_SECRET`.

### 4. Configure HubSpot App
1. Go to HubSpot Developer Portal → your app
2. Set the redirect URL to match `HUBSPOT_REDIRECT_URI` (e.g., `https://your-app.com/_wix/extensions/hubspot-callback`)
3. Enable scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`

### 5. Run Locally
Run `npm run dev`, then open the Wix dashboard → your app → Connection page → click "Connect HubSpot".

### 6. Deploy
Run `wix release` to deploy to production.
