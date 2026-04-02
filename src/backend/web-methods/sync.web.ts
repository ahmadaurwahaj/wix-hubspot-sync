import { webMethod, Permissions } from '@wix/web-methods';
import { DatabaseService } from '../services/database.service';
import { SyncService } from '../services/sync.service';
import { TokenManager } from '../utils/token-manager';
import { logger } from '../utils/logger';


export const getSyncLogs = webMethod(
  Permissions.Anyone,
  async (context, params: { instanceId?: string; limit?: number } = {}) => {
    try {
      const actualParams = typeof context === 'object' && 'instanceId' in context ? context : params;
      const siteId = actualParams?.instanceId || context?.instanceId;
      const limit = actualParams?.limit || 50;
      
      if (!siteId) {
        throw new Error('Missing instance context');
      }

      const logs = await DatabaseService.getSyncLogs(siteId, limit);
      const stats = await DatabaseService.getSyncStats(siteId);
      
      return {
        logs: logs.map(log => ({
          ...log,
          _id: String(log.id || ''),
          timestamp: log.timestamp.toISOString(),
        })),
        stats: {
          ...stats,
          lastSync: stats.lastSync?.toISOString(),
        },
      };
    } catch (error) {
      logger.error('Get sync logs error', error);
      throw new Error('Failed to get sync logs');
    }
  }
);


export const triggerSync = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {

      const instanceId = typeof context === 'string' 
        ? context 
        : (explicitInstanceId || context?.instanceId);
      
      if (!instanceId) {
        throw new Error('Missing instance context');
      }

      const accessToken = await TokenManager.getValidAccessToken(instanceId);
      
      const syncService = new SyncService(instanceId, accessToken);
      const result = await syncService.performBulkSync();
      
      logger.info('Manual sync completed', { instanceId, result });
      
      return {
        success: true,
        message: 'Sync completed',
        synced: result.synced,
        errors: result.errors,
      };
    } catch (error) {
      logger.error('Sync trigger error', error);
      
      if (error instanceof Error && error.message === 'HubSpot connection not found') {
        throw new Error('HubSpot not connected');
      }
      
      throw new Error('Failed to trigger sync');
    }
  }
);
