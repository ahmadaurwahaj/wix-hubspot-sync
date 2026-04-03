# API Plan — Wix ↔ HubSpot Integration

## Prerequisites

- Node.js v20.11.0+
- Wix developer account at [dev.wix.com](https://dev.wix.com)
- HubSpot developer account at [developers.hubspot.com](https://developers.hubspot.com)

---

## Step 1 — Install Dependencies

```bash
npm install
```

---

## Step 2 — Register a Wix App

1. Go to [dev.wix.com → My Apps](https://dev.wix.com/my-apps) → **Create New App**
2. Copy the **App ID** and replace the value in `wix.config.json`
3. Under **OAuth** settings, note your **App Secret**

---

## Step 3 — Create a HubSpot Public App

1. Go to [developers.hubspot.com](https://developers.hubspot.com) → **Apps** → **Create app**
2. Under the **Auth** tab, set **Redirect URL** to:
   - Local dev: `http://localhost:4321/_wix/extensions/hubspot-callback`
   - Production: `https://<your-site-url>/_wix/extensions/hubspot-callback`
3. Add **Scopes** (least privilege):
   - `oauth`
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.contacts.write`
   - `forms`
4. Under the **Webhooks** tab, set **Target URL** to:
   ```
   https://<your-site-url>/api/hubspot/webhook
   ```
5. Subscribe to events:
   - `contact.creation`
   - `contact.propertyChange`
6. Note your **Client ID** and **Client Secret**

---

## Step 4 — Configure Wix App Permissions

In your Wix app settings at [dev.wix.com](https://dev.wix.com), grant these permissions:

| Permission | Reason |
|-----------|--------|
| **Wix Contacts — Read** | Read contact data for sync |
| **Wix Contacts — Write** | Create/update contacts from HubSpot |
| **Wix Forms — Read Submissions** | Receive form submission events |
| **Wix CMS — Read/Write** | Access app data collections |

---

## Step 5 — Store Secrets

### Production — Wix Secrets Manager

In your Wix site: **Settings → Developer Tools → Secrets Manager**, add:

| Secret Name | Value |
|------------|-------|
| `HUBSPOT_CLIENT_ID` | HubSpot app Client ID |
| `HUBSPOT_CLIENT_SECRET` | HubSpot app Client Secret |
| `HUBSPOT_REDIRECT_URI` | `https://<your-site-url>/_wix/extensions/hubspot-callback` |
| `APP_WIX_CLIENT_ID` | Wix app Client ID (alias — Wix blocks `WIX_CLIENT_*` names) |
| `APP_WIX_CLIENT_SECRET` | Wix app Client Secret (alias) |

### Local Development — `.env.local`

```env
WIX_CLOUD_PROVIDER="CLOUD_FLARE"
WIX_CLIENT_ID="<your-wix-app-id>"
WIX_CLIENT_INSTANCE_ID="<your-instance-id>"
WIX_CLIENT_PUBLIC_KEY="<your-public-key>"
WIX_CLIENT_SECRET="<your-wix-app-secret>"
HUBSPOT_CLIENT_ID="<your-hubspot-client-id>"
HUBSPOT_CLIENT_SECRET="<your-hubspot-client-secret>"
HUBSPOT_REDIRECT_URI="http://localhost:4321/_wix/extensions/hubspot-callback"
APP_WIX_CLIENT_ID="<same-as-WIX_CLIENT_ID>"
APP_WIX_CLIENT_SECRET="<same-as-WIX_CLIENT_SECRET>"
```

> `APP_WIX_CLIENT_ID` / `APP_WIX_CLIENT_SECRET` are duplicates of the Wix credentials — needed because Wix Secrets Manager blocks names starting with `WIX_CLIENT_`.

---

## Step 6 — Run Locally

```bash
npm run dev
```

Open the Wix dashboard URL shown in terminal → your app → **Connection** page → **Connect HubSpot**.

---

## Step 7 — Deploy

```bash
wix release
```

After deploy, update `HUBSPOT_REDIRECT_URI` in both Wix Secrets Manager and HubSpot app settings to the production URL.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5 (SSR) |
| Hosting | Cloudflare Workers (`@astrojs/cloudflare`) |
| Data Storage | Wix CMS Data Collections (`@wix/data`) |
| Secrets | Wix Secrets Manager (`@wix/secrets`) |
| Dashboard UI | React + `@wix/design-system` |
| Sync Triggers | Wix backend events + HubSpot webhooks |

---

## Data Collections (Wix CMS)

All collections use **Admin-only** permissions. Backend code uses `auth.elevate()` to access them.

| Collection | ID | Purpose |
|-----------|-----|---------|
| Connections | `connections` | OAuth tokens, portal info, status |
| Field Mappings | `field-mappings` | User-configured Wix ↔ HubSpot field map |
| Sync Mappings | `sync-mappings` | `wixContactId ↔ hubspotContactId` |
| Sync Logs | `sync-logs` | Audit trail of all sync operations |

The app namespace is **automatically assigned by Wix** based on your developer account and app name (e.g., `@username/app-name`). Each developer gets a unique namespace.

After creating your Wix app, update the namespace in `src/backend/constants.ts`:

```ts
export const APP_NAMESPACE = '@your-username/your-app-name';
```

All collection IDs are derived from this constant:
- `@your-username/your-app-name/connections`
- `@your-username/your-app-name/field-mappings`
- `@your-username/your-app-name/sync-mappings`
- `@your-username/your-app-name/sync-logs`

> To find your namespace, run `npm run dev` and check the terminal output, or look at your app's `extensions.ts` — Wix generates the namespace prefix automatically.

---

## API Plan by Feature

### Feature 1 — Bi-Directional Contact Sync

| API | Used For |
|-----|----------|
| Wix Events: `wixContacts_onContactCreated` / `onContactUpdated` | Detect Wix contact changes → sync to HubSpot |
| HubSpot `POST /crm/v3/objects/contacts` | Create HubSpot contact |
| HubSpot `PATCH /crm/v3/objects/contacts/{id}` | Update HubSpot contact |
| HubSpot `GET /crm/v3/objects/contacts/{id}` | Fetch full contact on webhook |
| HubSpot Webhooks: `contact.creation` / `contact.propertyChange` | Detect HubSpot changes → sync to Wix |
| Wix Contacts REST API v4 | Create/update Wix contacts from HubSpot |
| `sync-mappings` collection | ID mapping for loop prevention |

**Loop Prevention:** Sync-source tracking + deduplication window + idempotency (skip identical values).

### Feature 2 — Form & Lead Capture

| API | Used For |
|-----|----------|
| Wix Events: `wixForms_onFormSubmitted` | Capture form submissions |
| HubSpot `POST /crm/v3/objects/contacts` (upsert by email) | Create/update HubSpot contact with form data |

**Captured Fields:** email, name, phone, company + UTM params (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) parsed from form fields and page URL.

### Feature 3 — OAuth Connection

| API | Used For |
|-----|----------|
| `https://app.hubspot.com/oauth/authorize` | User authorization |
| `POST https://api.hubspot.com/oauth/v1/token` | Code → token exchange |
| `POST https://api.hubspot.com/oauth/v1/token` (refresh) | Auto-refresh expired tokens |
| `GET https://api.hubspot.com/oauth/v1/access-tokens/{token}` | Get portal ID after auth |

### Feature 4 — Field Mapping UI

| API | Used For |
|-----|----------|
| HubSpot `GET /crm/v3/properties/contacts` | List available HubSpot properties |
| `field-mappings` collection | Persist user-configured mappings |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/oauth/initiate` | POST | Start HubSpot OAuth flow |
| `/api/oauth/disconnect` | POST | Disconnect HubSpot |
| `/api/dashboard/connection` | GET | Connection status |
| `/api/dashboard/mappings` | GET/POST | Get/save field mappings |
| `/api/dashboard/sync` | GET/POST | Sync logs + trigger bulk sync |
| `/api/hubspot/properties` | GET | List HubSpot contact properties |
| `/api/hubspot/webhook` | POST | Receive HubSpot webhook events |
| `/_wix/extensions/hubspot-callback` | GET | HubSpot OAuth callback |

> Routes under `/api/` use `@wix/astro` auth middleware. The callback under `/_wix/extensions/` bypasses middleware (no Wix auth on external redirects).

---

## Security

| Concern | Implementation |
|---------|----------------|
| OAuth 2.0 | Authorization Code flow, least-privilege scopes |
| Token Storage | Wix CMS (Admin-only collection), never exposed to frontend |
| Token Refresh | Auto-refresh before each API call |
| CSRF | OAuth state param with expiring HMAC |
| Webhook Auth | HMAC-SHA256 signature verification (`X-HubSpot-Signature-v3`) |
| Dashboard Auth | Wix instance JWT as `Authorization` header |
| Safe Logging | Tokens and PII never logged |

---

## Verification Checklist

- [ ] **Connect HubSpot** → popup opens → authorize → popup closes → status shows Connected
- [ ] **Create Wix contact** → appears in HubSpot within seconds
- [ ] **Update HubSpot contact** → reflected in Wix contacts
- [ ] **Submit Wix form** with `?utm_source=test&utm_medium=email` → HubSpot contact created with UTM data
- [ ] **No ping-pong** — check Sync Log, second event shows `skipped`
- [ ] **Disconnect** → sync stops → reconnect → sync resumes
