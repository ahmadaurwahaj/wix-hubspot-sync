import { createClient, type Client, type Row } from '@libsql/client/http';

export type { Row };

let client: Client | null = null;


export function getClient(): Client {
  if (client) {
    return client;
  }

  const url = import.meta.env.TURSO_DATABASE_URL;
  const authToken = import.meta.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  console.log('[turso] Creating client for:', url.substring(0, 30) + '...');

  client = createClient({
    url,
    authToken,
  });

  return client;
}

export async function getClientAsync(): Promise<Client> {
  return getClient();
}


export async function initializeSchema(): Promise<void> {
  const db = getClient();

  console.log('[turso] Initializing schema...');


  await db.execute(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT UNIQUE NOT NULL,
      hubspot_account_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scopes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      connected_at TEXT NOT NULL,
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);


  await db.execute(`
    CREATE TABLE IF NOT EXISTS field_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT UNIQUE NOT NULL,
      mappings TEXT NOT NULL,
      conflict_resolution TEXT NOT NULL DEFAULT 'last_updated_wins',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);


  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      wix_contact_id TEXT,
      hubspot_contact_id TEXT,
      last_synced_at TEXT NOT NULL,
      last_sync_source TEXT NOT NULL,
      sync_correlation_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_id, wix_contact_id),
      UNIQUE(site_id, hubspot_contact_id)
    )
  `);


  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_mappings_correlation 
    ON sync_mappings(sync_correlation_id)
  `);


  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      sync_correlation_id TEXT NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      wix_contact_id TEXT,
      hubspot_contact_id TEXT,
      error TEXT,
      metadata TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_logs_site_id 
    ON sync_logs(site_id, timestamp DESC)
  `);

  console.log('[turso] Schema initialized successfully');
}
