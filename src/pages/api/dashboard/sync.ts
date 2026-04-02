import type { APIRoute } from 'astro';
import { DatabaseService } from '../../../backend/services/database.service';
import { SyncService } from '../../../backend/services/sync.service';
import { TokenManager } from '../../../backend/utils/token-manager';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const instanceId = url.searchParams.get('instanceId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'Missing instanceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const logs = await DatabaseService.getSyncLogs(instanceId, limit);
    const stats = await DatabaseService.getSyncStats(instanceId);
    
    return new Response(JSON.stringify({
      logs: logs.map(log => ({
        ...log,
        _id: String(log.id || ''),
        timestamp: log.timestamp.toISOString(),
      })),
      stats: {
        ...stats,
        lastSync: stats.lastSync?.toISOString(),
        skipped: stats.skipped,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/dashboard/sync] GET Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get sync logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

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

    // Get valid access token (auto-refreshes if needed)
    const accessToken = await TokenManager.getValidAccessToken(instanceId);
    
    const syncService = new SyncService(instanceId, accessToken);
    const result = await syncService.performBulkSync();
    
    console.log('[api/dashboard/sync] Sync completed for instance:', instanceId);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Sync completed',
      synced: result.synced,
      errors: result.errors,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[api/dashboard/sync] POST Error:', error);
    
    const message = error instanceof Error && error.message === 'HubSpot connection not found'
      ? 'HubSpot not connected'
      : 'Failed to trigger sync';
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
