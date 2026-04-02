import { webMethod, Permissions } from '@wix/web-methods';
import { HubSpotService } from '../services/hubspot.service';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';
import { getSecret } from '../utils/secrets';
import {
  oauthStates,
  generateRandomState,
  validateOAuthState as _validateOAuthState,
} from '../utils/oauth-state';


export const validateOAuthState = _validateOAuthState;


export const initiateOAuth = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {
      const instanceId = typeof context === 'string' 
        ? context 
        : (explicitInstanceId || context?.instanceId);
      console.log('[oauth.web] initiateOAuth called, instanceId:', instanceId);
      
      if (!instanceId) {
        console.error('[oauth.web] Missing instanceId — context:', JSON.stringify(context));
        logger.error('Missing instanceId in OAuth initiation');
        throw new Error('Missing instance context');
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
        redirectUri = `http://localhost:4321/api/oauth/callback`;
      }
      
      const authUrl = await HubSpotService.getAuthorizationUrl(redirectUri, state);
      console.log('[oauth.web] authUrl built:', authUrl);
      
      logger.info('OAuth connection initiated', { instanceId, redirectUri });
      
      return {
        success: true,
        authUrl,
      };
    } catch (error) {
      console.error('[oauth.web] initiateOAuth FAILED:', error);
      logger.error('OAuth initiation error', error);
      throw error;
    }
  }
);


export const disconnectHubSpot = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {

      const instanceId = typeof context === 'string' 
        ? context 
        : (explicitInstanceId || context?.instanceId);
      
      if (!instanceId) {
        throw new Error('Missing instance context');
      }

      await DatabaseService.deleteConnection(instanceId);
      
      logger.info('HubSpot disconnected', { instanceId });
      
      return {
        success: true,
        message: 'Disconnected successfully',
      };
    } catch (error) {
      logger.error('Disconnect error', error);
      throw new Error('Failed to disconnect');
    }
  }
);
