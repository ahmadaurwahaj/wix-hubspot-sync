import type { APIRoute } from 'astro';
import { DatabaseService } from '../../../backend/services/database.service';

export const GET: APIRoute = async ({ request }) => {

  try {
    const url = new URL(request.url);
    const instanceId = url.searchParams.get('instanceId');
    
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'Missing instanceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const connection = await DatabaseService.getConnection(instanceId);
    
    if (!connection) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isExpired = connection.expiresAt < Date.now();
    
    return new Response(JSON.stringify({
      connected: connection.status === 'connected' && !isExpired,
      hubspotAccountId: connection.hubspotAccountId,
      connectedAt: connection.connectedAt?.toISOString(),
      lastSyncAt: connection.lastSyncAt?.toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/dashboard/connection] Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get connection status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
