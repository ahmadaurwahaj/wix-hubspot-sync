import { HubSpotService } from '../services/hubspot.service';
import { DatabaseService } from '../services/database.service';
import { logger } from './logger';


export class TokenManager {
  static async getValidAccessToken(instanceId: string): Promise<string> {
    const connection = await DatabaseService.getConnection(instanceId);
    
    if (!connection) {
      throw new Error('HubSpot connection not found');
    }

    if (connection.status !== 'connected') {
      throw new Error('HubSpot connection is not active');
    }

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const expiresAt = connection.expiresAt;

    if (expiresAt < now + fiveMinutes) {
      logger.info('Token expired or expiring soon, refreshing', {
        instanceId,
        expiresAt: new Date(expiresAt),
        now: new Date(now),
      });

      try {
        const tokens = await HubSpotService.refreshAccessToken(connection.refreshToken);
        
        const newExpiresAt = Date.now() + tokens.expires_in * 1000;

        await DatabaseService.updateConnectionTokens(
          instanceId,
          tokens.access_token,
          tokens.refresh_token,
          newExpiresAt
        );

        logger.info('Token refreshed successfully', {
          instanceId,
          newExpiresAt: new Date(newExpiresAt),
        });

        return tokens.access_token;
      } catch (error) {
        logger.error('Failed to refresh token', { instanceId, error });
        
        await DatabaseService.saveConnection({
          ...connection,
          status: 'error',
          updatedAt: new Date(),
        });

        throw new Error('Failed to refresh access token');
      }
    }

    return connection.accessToken;
  }

  static async getHubSpotService(instanceId: string): Promise<HubSpotService> {
    const accessToken = await this.getValidAccessToken(instanceId);
    return new HubSpotService(accessToken);
  }
}
