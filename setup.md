# Setup Guide — Wix ↔ HubSpot Integration

## What you need

- Node.js v20.11.0 or newer
- A Wix developer account — [dev.wix.com](https://dev.wix.com)
- A HubSpot developer account — [developers.hubspot.com](https://developers.hubspot.com)

---

## Step 1 — Create a New Wix App with the CLI

Use the Wix CLI to create a new app. This is the right way to start.

1. Sign in at [dev.wix.com](https://dev.wix.com) and create a new app from the dashboard.
2. In your terminal, run:

   ```bash
   npm create @wix/app@latest
   ```

   Follow the steps and link it to the app you just made.

3. Once the CLI sets up the new project folder, copy these files from this repo into it:
   - `src/` (replace the whole folder)
   - `package.json`
   - `astro.config.mjs`

4. Delete `package-lock.json` and `node_modules/` from the new folder if they exist.

5. Then run:
   ```bash
   npm install
   ```

---

## Step 2 — Create a HubSpot Legacy App

> **Important:** This project uses a **HubSpot Legacy App** (also called a Public App). You make it from the HubSpot developer portal. Do not use the new App Marketplace flow.

1. Go to [developers.hubspot.com](https://developers.hubspot.com)
2. Click **Apps** → **Create app** and pick the legacy/public app option
3. Under the **Auth** tab, add your **Redirect URL**:
   - Local dev: `http://localhost:4321/_wix/extensions/hubspot-callback`
   - Production: `https://<your-site-url>/_wix/extensions/hubspot-callback`
4. Add these **Scopes**:
   - `oauth`
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.contacts.write`
   - `forms`
5. Under the **Webhooks** tab, set the **Target URL**:
   ```
   https://<your-site-url>/api/hubspot/webhook
   ```
6. Subscribe to these events:
   - `contact.creation`
   - `contact.propertyChange`
7. Save your **Client ID** and **Client Secret** — you will need them in Step 4.

---

## Step 3 — Set Permissions for Your Wix App

Your Wix app needs the right permissions to read and write contacts.

1. Go to [manage.wix.com/studio/custom-apps](https://manage.wix.com/studio/custom-apps)
2. Click on your app
3. In the left sidebar, go to **Develop → Permissions**
4. Add these permissions:

| Permission               | Why you need it                          |
| ------------------------ | ---------------------------------------- |
| **Manage Contacts**      | Create and update contacts from HubSpot  |
| **Read Contacts**        | Read Wix contacts to sync to HubSpot     |
| **Read Submissions**     | Get events when a Wix form is submitted  |
| **Wix CMS — Read/Write** | Store app data like tokens and sync logs |

---

## Step 4 — Fill in Your Environment Variables

### Local dev — `.env.local`

Copy `.env.example` to `.env.local` and fill in each value:

```env
WIX_CLOUD_PROVIDER="CLOUD_FLARE"
WIX_CLIENT_ID="<your-wix-app-id>"
WIX_CLIENT_INSTANCE_ID="<your-instance-id>"
WIX_CLIENT_PUBLIC_KEY="<your-public-key>"
WIX_CLIENT_SECRET="<your-wix-app-secret>"

HUBSPOT_CLIENT_ID="<your-hubspot-client-id>"
HUBSPOT_CLIENT_SECRET="<your-hubspot-client-secret>"
HUBSPOT_REDIRECT_URI="http://localhost:4321/_wix/extensions/hubspot-callback"

# These two are the same as WIX_CLIENT_ID and WIX_CLIENT_SECRET above.
# Wix Secrets Manager blocks names that start with WIX_CLIENT_, so we use APP_ here.
APP_WIX_CLIENT_ID="<same value as WIX_CLIENT_ID>"
APP_WIX_CLIENT_SECRET="<same value as WIX_CLIENT_SECRET>"
```

> **Quick note on the duplicates:**
> `APP_WIX_CLIENT_ID` is the same as `WIX_CLIENT_ID`.
> `APP_WIX_CLIENT_SECRET` is the same as `WIX_CLIENT_SECRET`.
> We need both names because Wix Secrets Manager won't accept names that start with `WIX_CLIENT_`.

### Production — Wix Secrets Manager

In your Wix site: **Settings → Developer Tools → Secrets Manager**, add:

| Secret Name             | Value                                             |
| ----------------------- | ------------------------------------------------- |
| `HUBSPOT_CLIENT_ID`     | Your HubSpot Client ID                            |
| `HUBSPOT_CLIENT_SECRET` | Your HubSpot Client Secret                        |
| `HUBSPOT_REDIRECT_URI`  | Your production callback URL                      |
| `APP_WIX_CLIENT_ID`     | Same as your Wix App ID (`WIX_CLIENT_ID`)         |
| `APP_WIX_CLIENT_SECRET` | Same as your Wix App Secret (`WIX_CLIENT_SECRET`) |

---

## Step 5 — Turn On Dev Mode (CMS)

The app saves data to Wix CMS. If Dev Mode is off on your test site, the app will throw a `WDE0110: Wix Code not enabled` error and nothing will work.

Here's how to turn it on:

1. Go to [manage.wix.com/studio/custom-apps](https://manage.wix.com/studio/custom-apps)
2. Click on your app
3. Click the **Design Site** button — this opens the Wix Editor for your test site
4. In the top bar of the editor, click **Dev Mode**
5. Click **Turn On Dev Mode**
6. Save or publish the site

Once Dev Mode is on, the Wix Data API works and your app can read and write to its collections.

---

## Step 6 — Run It Locally

```bash
npm run dev
```

Open the Wix dashboard URL that shows in the terminal → go to your app → **Connection** page → click **Connect HubSpot**.

---

## Step 7 — Deploy

```bash
wix release
```

After you deploy, go update `HUBSPOT_REDIRECT_URI` in both Wix Secrets Manager and HubSpot app settings. Change it to your production callback URL.

---

## How It All Fits Together

| Layer         | What it uses                          |
| ------------- | ------------------------------------- |
| Framework     | Astro 5 (SSR)                         |
| Hosting       | Cloudflare Workers                    |
| Data Storage  | Wix CMS Data Collections              |
| Secrets       | Wix Secrets Manager                   |
| Dashboard UI  | React + Wix Design System             |
| Sync Triggers | Wix backend events + HubSpot webhooks |

---

## Data Collections

All collections only allow admin access. Backend code uses `auth.elevate()` to read and write them.

| Collection     | ID               | What it stores                               |
| -------------- | ---------------- | -------------------------------------------- |
| Connections    | `connections`    | HubSpot tokens and connection status         |
| Field Mappings | `field-mappings` | Which Wix fields map to which HubSpot fields |
| Sync Mappings  | `sync-mappings`  | Wix contact ID ↔ HubSpot contact ID          |
| Sync Logs      | `sync-logs`      | Full history of every sync                   |

After you create your Wix app, update the namespace in `src/backend/constants.ts`:

```ts
export const APP_NAMESPACE = "@your-username/your-app-name";
```

Run `npm run dev` and check the terminal to find your namespace.

---

## API Routes

| Route                               | Method   | What it does                          |
| ----------------------------------- | -------- | ------------------------------------- |
| `/api/oauth/initiate`               | POST     | Start the HubSpot login flow          |
| `/api/oauth/disconnect`             | POST     | Disconnect HubSpot                    |
| `/api/dashboard/connection`         | GET      | Check if HubSpot is connected         |
| `/api/dashboard/mappings`           | GET/POST | Get or save field mappings            |
| `/api/dashboard/sync`               | GET/POST | View sync logs or trigger a bulk sync |
| `/api/hubspot/properties`           | GET      | List HubSpot contact properties       |
| `/api/hubspot/webhook`              | POST     | Receive events from HubSpot           |
| `/_wix/extensions/hubspot-callback` | GET      | HubSpot OAuth callback                |

---

## Security

| What           | How                                                      |
| -------------- | -------------------------------------------------------- |
| OAuth 2.0      | Authorization Code flow with least-privilege scopes      |
| Token storage  | Wix CMS admin-only collection, never sent to the browser |
| Token refresh  | Auto-refreshes before every API call                     |
| CSRF           | OAuth state param with expiring HMAC                     |
| Webhook auth   | HMAC-SHA256 signature check on every webhook             |
| Dashboard auth | Wix instance JWT on every request                        |
| Safe logging   | Tokens and personal data are never logged                |

---

## Final Checklist

- [ ] Connect HubSpot → popup opens → authorize → closes → status shows Connected
- [ ] Create a Wix contact → it shows up in HubSpot within seconds
- [ ] Update a HubSpot contact → it updates in Wix too
- [ ] Submit a Wix form with `?utm_source=test` → HubSpot contact made with UTM data
- [ ] No ping-pong — check Sync Log, the second event should show `skipped`
- [ ] Disconnect → sync stops → reconnect → sync starts again
