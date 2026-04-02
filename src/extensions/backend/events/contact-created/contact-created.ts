import { contacts } from '@wix/crm';

export default contacts.onContactCreated(async (event: any) => {
  console.log('=== WIX CONTACT CREATED EVENT ===');
  console.log('Full event:', JSON.stringify(event, null, 2));

  try {
    const { DatabaseService } = await import('../../../../backend/services/database.service');
    const { SyncService } = await import('../../../../backend/services/sync.service');
    const { WixContactsService } = await import('../../../../backend/services/wix-contacts.service');
    const { TokenManager } = await import('../../../../backend/utils/token-manager');

    // Extract contact entity — handle both SDK-normalized and raw webhook shapes
    const contact = event.entity ?? event.createdEvent?.entity;
    if (!contact) {
      console.log('WARNING: No contact entity found in event');
      return;
    }

    const contactId = contact.id ?? contact._id;

    // Get instanceId from metadata, or fall back to the active connection
    let instanceId = event.metadata?.instanceId;
    const connection = instanceId
      ? await DatabaseService.getConnection(instanceId)
      : await DatabaseService.getActiveConnection();

    if (!connection || connection.status !== 'connected') {
      console.log('No active HubSpot connection');
      return;
    }
    instanceId = instanceId || connection.siteId;

    console.log('Contact created', { contactId, instanceId });

    const flatContact = contact.info
      ? WixContactsService.fromWixContact(contact)
      : contact;

    const accessToken = await TokenManager.getValidAccessToken(instanceId);
    const syncService = new SyncService(instanceId, accessToken);
    await syncService.syncWixToHubSpot(flatContact as any);

    console.log('Contact created and synced to HubSpot', { contactId });
  } catch (error) {
    console.error('Failed to handle contact created event', error);
  }
});
