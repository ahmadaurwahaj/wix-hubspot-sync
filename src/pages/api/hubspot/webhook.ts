import type { APIRoute } from 'astro';
import * as crypto from 'node:crypto';
import { DatabaseService } from '../../../backend/services/database.service';
import { SyncService } from '../../../backend/services/sync.service';
import { TokenManager } from '../../../backend/utils/token-manager';
import { logger } from '../../../backend/utils/logger';
import { getSecret } from '../../../backend/utils/secrets';

/**
 * HubSpot Webhook receiver — /api/hubspot/webhook
 *
 * HubSpot sends an array of subscription events. Each event contains:
 *   { subscriptionType, objectId, propertyName, propertyValue, changeSource, ... }
 *
 * We validate the X-HubSpot-Signature-v3 header to ensure authenticity,
 * then fan-out each contact.creation / contact.propertyChange event to
 * syncHubSpotToWix().
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();

    // ── Signature verification (mandatory) ──────────────
    const clientSecret = await getSecret('HUBSPOT_CLIENT_SECRET');
    const signatureHeader = request.headers.get('X-HubSpot-Signature-v3');
    const timestampHeader = request.headers.get('X-HubSpot-Request-Timestamp');

    if (!signatureHeader || !timestampHeader) {
      logger.warn('HubSpot webhook missing signature headers');
      return json({ error: 'Missing signature headers' }, 401);
    }

    // Reject if timestamp older than 5 minutes (replay protection)
    if (Math.abs(Date.now() - Number(timestampHeader)) > 300_000) {
      return json({ error: 'Stale timestamp' }, 401);
    }

    const isValid = verifySignatureV3(
      clientSecret,
      request.method,
      request.url,
      body,
      timestampHeader,
      signatureHeader,
    );
    if (!isValid) {
      logger.warn('Invalid HubSpot webhook signature');
      return json({ error: 'Invalid signature' }, 401);
    }

    const events: HubSpotWebhookEvent[] = JSON.parse(body);

    if (!Array.isArray(events) || events.length === 0) {
      return json({ received: 0 });
    }

    logger.info('HubSpot webhook received', { count: events.length });

 
    let processed = 0;

    for (const event of events) {
      const { subscriptionType, objectId } = event;

   
      if (
        subscriptionType !== 'contact.creation' &&
        subscriptionType !== 'contact.propertyChange'
      ) {
        continue;
      }

      try {
   
        const siteId = await findSiteForPortal(String(event.portalId));
        if (!siteId) {
          logger.debug('No site connected for portal', { portalId: event.portalId });
          continue;
        }

        const accessToken = await TokenManager.getValidAccessToken(siteId);
        const syncService = new SyncService(siteId, accessToken);

        // Fetch full contact from HubSpot  
        const hubspotService = await TokenManager.getHubSpotService(siteId);
        const contact = await hubspotService.getContact(String(objectId));

        await syncService.syncHubSpotToWix(contact, `hubspot-wh-${event.eventId ?? objectId}`);
        processed++;
      } catch (err) {
        logger.error('Failed to process webhook event', { objectId, err });
      }
    }

    logger.info('HubSpot webhook processed', { processed, total: events.length });
    return json({ received: events.length, processed });
  } catch (error) {
    logger.error('HubSpot webhook error', error);
    return json({ error: 'Webhook processing failed' }, 500);
  }
};


interface HubSpotWebhookEvent {
  eventId?: number;
  subscriptionId?: number;
  portalId: number;
  appId?: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber?: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
}



function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Verify HubSpot signature v3.
 * https://developers.hubspot.com/docs/api/webhooks#request-validation
 */
function verifySignatureV3(
  clientSecret: string,
  method: string,
  uri: string,
  body: string,
  timestamp: string,
  signature: string,
): boolean {
  try {
    const message = `${method}${uri}${body}${timestamp}`;
    const hash = crypto.createHmac('sha256', clientSecret).update(message).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Find the siteId associated with a HubSpot portal (account) ID.
 * Queries the connections table via DatabaseService.
 */
async function findSiteForPortal(portalId: string): Promise<string | null> {
  const connection = await DatabaseService.getConnectionByHubSpotAccount(portalId);
  return connection?.siteId ?? null;
}
