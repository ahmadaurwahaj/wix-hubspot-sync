import { webMethod, Permissions } from '@wix/web-methods';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';


export const getFieldMappings = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {
      const instanceId = typeof context === 'string' 
        ? context 
        : (explicitInstanceId || context?.instanceId);
      
      if (!instanceId) {
        throw new Error('Missing instance context');
      }

      const mappings = await DatabaseService.getFieldMappings(instanceId);
      
      if (!mappings) {
        return {
          mappings: [],
          conflictResolution: 'last_updated_wins',
        };
      }

      return mappings;
    } catch (error) {
      logger.error('Get field mappings error', error);
      throw new Error('Failed to get mappings');
    }
  }
);


export const saveFieldMappings = webMethod(
  Permissions.Anyone,
  async (context, params: {
    instanceId?: string;
    mappings: any[];
    conflictResolution?: string;
  }) => {
    try {
      const actualParams = typeof context === 'object' && 'mappings' in context ? context : params;
      const siteId = actualParams?.instanceId || (typeof context === 'object' && 'instanceId' in context ? context.instanceId : undefined);
      
      if (!siteId) {
        throw new Error('Missing instance context');
      }

      if (!actualParams?.mappings || !Array.isArray(actualParams.mappings)) {
        throw new Error('Invalid mappings data');
      }

      await DatabaseService.saveFieldMappings({
        siteId,
        mappings: actualParams.mappings,
        conflictResolution: actualParams.conflictResolution || 'last_updated_wins',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Field mappings saved', { siteId, count: actualParams.mappings.length });

      return {
        success: true,
        message: 'Mappings saved successfully',
      };
    } catch (error) {
      logger.error('Save field mappings error', error);
      throw new Error('Failed to save mappings');
    }
  }
);
