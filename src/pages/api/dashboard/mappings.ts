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

    const mappings = await DatabaseService.getFieldMappings(instanceId);
    
    if (!mappings) {
      return new Response(JSON.stringify({
        mappings: [],
        conflictResolution: 'last_updated_wins',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(mappings), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/dashboard/mappings] GET Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get mappings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { instanceId, mappings, conflictResolution } = body;
    
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'Missing instanceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!mappings || !Array.isArray(mappings)) {
      return new Response(JSON.stringify({ error: 'Invalid mappings data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await DatabaseService.saveFieldMappings({
      siteId: instanceId,
      mappings,
      conflictResolution: conflictResolution || 'last_updated_wins',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('[api/dashboard/mappings] Saved mappings for instance:', instanceId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Mappings saved successfully',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/dashboard/mappings] POST Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to save mappings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
