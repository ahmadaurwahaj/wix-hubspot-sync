import { webMethod, Permissions } from '@wix/web-methods';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

/**
 * Gets the current HubSpot connection status
 */
export const getConnectionStatus = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {
      const siteId = typeof context === 'string' 
        ? context 
        : (explicitInstanceId || context?.instanceId);
      
      if (!siteId) {
        throw new Error('Missing instance context');
      }

      const connection = await DatabaseService.getConnection(siteId);
      
      if (!connection) {
        return {
          connected: false,
        };
      }

      const isExpired = connection.expiresAt < Date.now();
      
      return {
        connected: connection.status === 'connected' && !isExpired,
        hubspotAccountId: connection.hubspotAccountId,
        connectedAt: connection.connectedAt?.toISOString(),
        lastSyncAt: connection.lastSyncAt?.toISOString(),
      };
    } catch (error) {
      console.error('[connection.web] getConnectionStatus FAILED:', error);
      logger.error('Get connection status error', error);
      throw error;
    }
  }
);
