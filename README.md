# Wix ↔ HubSpot Integration

Self-hosted Wix app (Astro + Cloudflare) for bi-directional contact sync and form lead capture with HubSpot.

## Features

- **Bi-directional contact sync** — Wix ↔ HubSpot with configurable field mappings
- **Loop prevention** — Deduplication window, correlation IDs, idempotency, sync-source tracking
- **Conflict resolution** — Last-updated-wins (default), HubSpot-wins, or Wix-wins
- **Form lead capture** — Wix form submissions → HubSpot contacts with UTM attribution
- **OAuth 2.0** — Secure HubSpot connect/disconnect from Wix dashboard
- **Field mapping UI** — Configurable Wix field ↔ HubSpot property table with direction & transforms

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Astro 5 (SSR, server output) |
| Adapter | @astrojs/cloudflare |
| Wix Integration | @wix/astro (self-hosted app) |
| Dashboard UI | React + @wix/design-system |
| Database | Turso (libsql/SQLite) |
| HubSpot | CRM Contacts API v3 + OAuth 2.0 |
| Wix Contacts | REST API v4 (server-to-server) |

## Setup

### 1. Install

```bash
cd wh-integration
npm install
```

### 2. Environment Variables

Create `.env.local`:

```env
WIX_CLIENT_ID=your_wix_app_client_id
WIX_CLIENT_SECRET=your_wix_app_client_secret
HUBSPOT_CLIENT_ID=your_hubspot_client_id
HUBSPOT_CLIENT_SECRET=your_hubspot_client_secret
HUBSPOT_REDIRECT_URI=https://your-domain/_wix/extensions/hubspot-callback
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token
```

### 3. Run

```bash
npm run dev    # wix dev — starts Astro + Wix CLI tunnel
```

### 4. Connect HubSpot

1. Open the app in Wix dashboard → **Connection** page
2. Click **Connect to HubSpot** → authorize
3. Go to **Field Mapping** page → configure mappings → Save
4. Go to **Sync Status** page → click **Sync Now** or let polling handle it

## Project Structure

```
src/
├── backend/
│   ├── services/
│   │   ├── sync.service.ts          # Bi-directional sync engine
│   │   ├── hubspot.service.ts       # HubSpot CRM API client
│   │   ├── wix-contacts.service.ts  # Wix Contacts REST v4 client
│   │   └── database.service.ts      # Turso DB operations
│   ├── utils/
│   │   ├── token-manager.ts         # OAuth token refresh
│   │   ├── turso.ts                 # DB schema + connection
│   │   ├── oauth-state.ts           # OAuth CSRF state
│   │   └── logger.ts                # Safe logging (no PII)
│   ├── routes/
│   │   └── hubspot-oauth-callback.ts
│   ├── events.ts                    # Wix contact created/updated handlers
│   ├── form-handler.ts              # Wix form submission → HubSpot
│   └── jobs.ts                      # Polling sync + token refresh + log cleanup
├── extensions/dashboard/pages/
│   ├── connection/                  # OAuth connect/disconnect UI
│   ├── field-mapping/               # Field mapping table UI
│   └── sync-status/                 # Sync logs + manual trigger UI
└── pages/_wix/extensions/api/       # Server API routes
    ├── dashboard/                   # connection, mappings, sync endpoints
    ├── hubspot/                     # properties, webhook endpoints
    └── oauth/                       # initiate, disconnect endpoints
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `hubspot_connections` | OAuth tokens, portal ID, connection status |
| `field_mappings` | User-configured field mapping rules (JSON) |
| `sync_mappings` | Wix contact ID ↔ HubSpot contact ID mapping |
| `sync_logs` | Audit log of all sync operations |

## Sync Flow

**Wix → HubSpot:** Wix event (`onContactCreated`/`onContactUpdated`) → flatten contact → apply field mappings → `createOrUpdateContact` in HubSpot → save sync mapping.

**HubSpot → Wix:** Webhook (`contact.creation`/`contact.propertyChange`) or polling → apply field mappings → create/update Wix contact via REST v4 → save sync mapping.

**Bulk sync:** Fetches all HubSpot contacts (paginated) → syncs to Wix, then fetches all Wix contacts → syncs to HubSpot. Triggered manually from dashboard.

**Form capture:** `wixForms_onFormSubmitted` → extract email, name, custom fields + UTM params from page URL → `createOrUpdateContact` in HubSpot with attribution properties.

## Loop Prevention

1. **Deduplication cache** — 30s window, skip if same contact synced recently
2. **Correlation ID** — Skip if sync mapping's correlationId matches the triggering event
3. **Idempotency** — Compare property values, skip if no changes
4. **Direction filter** — Respect per-field sync direction (wix_to_hubspot / hubspot_to_wix / bidirectional)
5. **Conflict resolution** — When both sides changed, configurable winner decides which update applies

## Documentation

- [API_PLAN.md](API_PLAN.md) — APIs used per feature and why

## Sync Logic

### Loop Prevention

1. **Correlation ID** - Unique ID for each sync operation
2. **Origin Detection** - Detect self-generated events
3. **Deduplication** - 30-second window to prevent rapid syncs
4. **Idempotency** - Only sync if values changed
5. **Version Tracking** - Track sync versions

### Conflict Resolution

When both systems are updated:
- **Last Updated Wins** - Most recent update wins (default)
- **HubSpot Wins** - HubSpot always takes precedence
- **Wix Wins** - Wix always takes precedence

### Field Transformations

- **trim** - Remove whitespace
- **lowercase** - Convert to lowercase
- **uppercase** - Convert to uppercase

## Form Integration

### Captured Data

- Email (required)
- First Name, Last Name
- Phone, Company
- Custom fields

### Attribution

- Page URL
- Referrer
- UTM parameters (source, medium, campaign, term, content)
- Form ID
- Timestamp

## Development

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

### Deploy

```bash
wix deploy
```

## Monitoring

### Dashboard

View sync statistics in the app dashboard:
- Total syncs
- Success rate
- Error rate
- Recent activity

### Logs

```bash
# View logs
wix logs

# Follow logs
wix logs --follow
```

### Database

Monitor MongoDB collections:
- Check sync_logs for errors
- Review sync_mappings for coverage
- Monitor connection status

## Troubleshooting

### OAuth Issues

- Verify redirect URI matches HubSpot settings
- Check Client ID and Secret are correct
- Ensure HubSpot app is not in draft mode

### Sync Issues

- Check field mappings are configured
- Verify connection is active
- Review sync logs for errors
- Check deduplication isn't blocking syncs

### Performance Issues

- Review HubSpot API rate limits
- Check database indexes
- Monitor sync log size
- Optimize field mappings

## Security

- OAuth 2.0 authentication
- Secure token storage
- Safe logging (auto-redacts sensitive data)
- HTTPS only in production
- Input validation and sanitization

## Support

For issues or questions:
1. Check documentation in `/docs`
2. Review sync logs in dashboard
3. Check Wix logs: `wix logs`
4. Review MongoDB collections

## License

Proprietary - All rights reserved

## Credits

Built with:
- Wix CLI
- Wix Design System
- HubSpot API
- MongoDB Atlas
- TypeScript
- React

---

**Version:** 1.0.0  
**Last Updated:** March 30, 2026


