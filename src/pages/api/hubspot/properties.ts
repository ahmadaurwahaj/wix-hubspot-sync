import type { APIRoute } from 'astro';
import { TokenManager } from '../../../backend/utils/token-manager';

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


    const hubspotService = await TokenManager.getHubSpotService(instanceId);
    const properties = await hubspotService.getContactProperties();
    
    return new Response(JSON.stringify({ properties }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/hubspot/properties] Error:', error);
    
    const message = error instanceof Error && error.message === 'HubSpot connection not found'
      ? 'HubSpot not connected'
      : 'Failed to get properties';
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
