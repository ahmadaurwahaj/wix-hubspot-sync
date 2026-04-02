import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import { DatabaseService } from './services/database.service';
import { HubSpotService } from './services/hubspot.service';
import { SyncService } from './services/sync.service';
import { TokenManager } from './utils/token-manager';
import { logger } from './utils/logger';

const APP_NAMESPACE = '@zohaibahmad7/wh-integration';
const CONNECTIONS = `${APP_NAMESPACE}/connections`;
const SYNC_LOGS = `${APP_NAMESPACE}/sync-logs`;

function elevatedQuery(...args: Parameters<typeof items.query>) {
  return auth.elevate(items.query)(...args);
}
function elevatedRemove(...args: Parameters<typeof items.remove>) {
  return auth.elevate(items.remove)(...args);
}

export async function job_refreshTokens() {
  try {
    logger.info('Starting token refresh job');

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const expiryThreshold = now + fiveMinutes;

    // Find connected connections with tokens expiring soon
    const result = await elevatedQuery(CONNECTIONS)
      .eq('status', 'connected')
      .lt('expiresAt', expiryThreshold)
      .gt('expiresAt', now)
      .find();

    const expiringConnections = result.items;

    logger.info('Found connections to refresh', {
      count: expiringConnections.length,
    });

    let refreshed = 0;
    let failed = 0;

    for (const connection of expiringConnections) {
      const conn = connection as Record<string, any>;
      try {
        const tokens = await HubSpotService.refreshAccessToken(conn.refreshToken);
        const newExpiresAt = Date.now() + tokens.expires_in * 1000;

        await DatabaseService.updateConnectionTokens(
          conn.siteId,
          tokens.access_token,
          tokens.refresh_token,
          newExpiresAt
        );

        refreshed++;
        logger.info('Token refreshed in job', {
          siteId: conn.siteId,
          newExpiresAt: new Date(newExpiresAt),
        });
      } catch (error) {
        failed++;
        logger.error('Failed to refresh token in job', {
          siteId: conn.siteId,
          error,
        });

        // Mark connection as error
        await DatabaseService.saveConnection({
          ...conn,
          status: 'error',
        } as any);
      }
    }

    logger.info('Token refresh job completed', { refreshed, failed });
  } catch (error) {
    logger.error('Token refresh job failed', error);
  }
}


export async function job_pollingSyncFallback() {
  try {
    logger.info('Starting polling sync fallback');

    const result = await elevatedQuery(CONNECTIONS)
      .eq('status', 'connected')
      .find();

    let totalProcessed = 0;

    for (const row of result.items) {
      const siteId = (row as Record<string, any>).siteId;

      try {
        const config = await DatabaseService.getFieldMappings(siteId);
        const hasHsToWix = config?.mappings?.some(
          m => m.direction === 'hubspot_to_wix' || m.direction === 'bidirectional'
        );
        if (!hasHsToWix) {
          logger.debug('No HubSpot→Wix mappings, skipping poll for site', { siteId });
          continue;
        }

        const accessToken = await TokenManager.getValidAccessToken(siteId);
        const hubspotService = new HubSpotService(accessToken);
        const syncService = new SyncService(siteId, accessToken);

        const contacts = await hubspotService.listContacts(undefined, 50);

        for (const contact of contacts.results ?? []) {
          const mapping = await DatabaseService.getSyncMappingByHubSpotId(siteId, contact.id);
          if (mapping) {
            const lastSynced = mapping.lastSyncedAt.getTime();
            const contactUpdated = new Date(contact.updatedAt).getTime();
            if (lastSynced >= contactUpdated) continue;
          }

          try {
            await syncService.syncHubSpotToWix(contact, `poll-${contact.id}`);
            totalProcessed++;
          } catch (err) {
            logger.error('Polling sync error for contact', { contactId: contact.id, err });
          }
        }
      } catch (err) {
        logger.error('Polling sync failed for site', { siteId, err });
      }
    }

    logger.info('Polling sync fallback completed', { totalProcessed });
  } catch (error) {
    logger.error('Polling sync fallback failed', error);
  }
}


export async function job_cleanupOldLogs() {
  try {
    logger.info('Starting log cleanup job');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query old logs and remove them
    const result = await elevatedQuery(SYNC_LOGS)
      .lt('logTimestamp', thirtyDaysAgo)
      .limit(1000)
      .find();

    let deletedCount = 0;
    for (const item of result.items) {
      await elevatedRemove(SYNC_LOGS, item._id!);
      deletedCount++;
    }

    logger.info('Log cleanup job completed', { deletedRows: deletedCount });
  } catch (error) {
    logger.error('Log cleanup job failed', error);
  }
}


let schedulerStarted = false;

export function startJobScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const SYNC_INTERVAL = 5 * 60_000;


  setInterval(() => { job_refreshTokens().catch(() => {}); }, 4 * 60_000);


  setInterval(() => { job_pollingSyncFallback().catch(() => {}); }, SYNC_INTERVAL);

 
  setInterval(() => { job_cleanupOldLogs().catch(() => {}); }, 24 * 60 * 60_000);

  logger.info('Job scheduler started', { syncIntervalMs: SYNC_INTERVAL });
}
