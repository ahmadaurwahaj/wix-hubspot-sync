import { contacts } from '@wix/crm';
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import { COLLECTIONS } from '../../../../backend/constants';

const { CONNECTIONS, SYNC_LOGS } = COLLECTIONS;

async function writeDiagnosticLog(entry: Record<string, any>) {
  try {
    await auth.elevate(items.insert)(SYNC_LOGS, {
      siteId: entry.siteId || 'unknown',
      syncCorrelationId: entry.syncCorrelationId || 'diag-' + Date.now(),
      source: entry.source || 'wix',
      action: entry.action || 'create',
      status: entry.status || 'error',
      error: entry.error || null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      logTimestamp: new Date(),
    });
  } catch (logErr) {
    console.error('[contact-created] Failed to write diagnostic log:', logErr);
  }
}

export default contacts.onContactCreated(async (event: any) => {
  console.log('[contact-created] Event received');

  // Step 1: Get connection
  let siteId = 'unknown';
  try {
    const connResult = await auth.elevate(items.query)(CONNECTIONS)
      .eq('status', 'connected')
      .find();

    if (connResult.items.length === 0) {
      console.log('[contact-created] No active HubSpot connection');
      return;
    }
    siteId = (connResult.items[0] as Record<string, any>).siteId;
  } catch (dbErr: any) {
    console.error('[contact-created] auth.elevate/query FAILED:', dbErr);
    return;
  }

  // Step 2: Extract contact
  const contact = event.entity ?? event.createdEvent?.entity ?? event.data?.entity;
  if (!contact) {
    await writeDiagnosticLog({
      siteId,
      error: `No contact entity. Keys: ${Object.keys(event).join(', ')}`,
      metadata: { step: 'extractEntity' },
    });
    return;
  }

  const contactId = contact.id ?? contact._id;

  // Skip contacts created by Wix Forms — handled by form-submitted event
  if (contact.source?.sourceType === 'WIX_FORMS') {
    console.log('[contact-created] Skipping WIX_FORMS source', { contactId });
    return;
  }

  // Step 3: Get token and sync
  try {
    const { WixContactsService } = await import('../../../../backend/services/wix-contacts.service');
    const { TokenManager } = await import('../../../../backend/utils/token-manager');
    const { SyncService } = await import('../../../../backend/services/sync.service');

    const flatContact = contact.info
      ? WixContactsService.fromWixContact(contact)
      : contact;

    const accessToken = await TokenManager.getValidAccessToken(siteId);
    const syncService = new SyncService(siteId, accessToken);
    await syncService.syncWixToHubSpot(flatContact as any);

    console.log('[contact-created] Synced to HubSpot', { contactId });
  } catch (syncErr: any) {
    await writeDiagnosticLog({
      siteId,
      error: `Sync failed: ${syncErr?.message}`,
      metadata: { step: 'syncToHubSpot', contactId },
    });
  }
});
