import type { APIRoute } from 'astro';
import { HubSpotService } from '../../../backend/services/hubspot.service';
import { oauthStates, generateRandomState } from '../../../backend/utils/oauth-state';
import { getSecret } from '../../../backend/utils/secrets';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const instanceId = body.instanceId;
    
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'Missing instanceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }


    const state = generateRandomState();
    
    oauthStates.set(state, {
      instanceId,
      timestamp: Date.now(),
    });

    let redirectUri: string;
    try {
      redirectUri = await getSecret('HUBSPOT_REDIRECT_URI');
    } catch {
      redirectUri = `http://localhost:4321/_wix/extensions/hubspot-callback`;
    }
    
    const authUrl = await HubSpotService.getAuthorizationUrl(redirectUri, state);
    
    console.log('[api/oauth/initiate] Auth URL generated for instance:', instanceId);
    
    return new Response(JSON.stringify({
      success: true,
      authUrl,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/oauth/initiate] Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to initiate OAuth' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
