import { extensions } from '@wix/astro/builders';

export const dataExtension = extensions.genericExtension({
  compId: 'd4e8f2a1-7b3c-4d9e-a5f1-8c2b6d0e3a7f',
  compName: 'data-extension',
  compType: 'DATA_COMPONENT',
  compData: {
    dataComponent: {
      collections: [
        {
          schemaUrl: 'https://www.wix.com/',
          idSuffix: 'connections',
          displayName: 'HubSpot Connections',
          displayField: 'siteId',
          fields: [
            { key: 'siteId', displayName: 'Site ID', type: 'TEXT', unique: true, required: true },
            { key: 'hubspotAccountId', displayName: 'HubSpot Account ID', type: 'TEXT' },
            { key: 'accessToken', displayName: 'Access Token', type: 'TEXT' },
            { key: 'refreshToken', displayName: 'Refresh Token', type: 'TEXT' },
            { key: 'expiresAt', displayName: 'Expires At', type: 'NUMBER' },
            { key: 'scopes', displayName: 'Scopes', type: 'TEXT' },
            { key: 'status', displayName: 'Status', type: 'TEXT' },
            { key: 'connectedAt', displayName: 'Connected At', type: 'DATETIME' },
            { key: 'lastSyncAt', displayName: 'Last Sync At', type: 'DATETIME' },
          ],
          dataPermissions: {
            itemRead: 'PRIVILEGED',
            itemInsert: 'PRIVILEGED',
            itemUpdate: 'PRIVILEGED',
            itemRemove: 'PRIVILEGED',
          },
        },
        {
          schemaUrl: 'https://www.wix.com/',
          idSuffix: 'field-mappings',
          displayName: 'Field Mappings',
          displayField: 'siteId',
          fields: [
            { key: 'siteId', displayName: 'Site ID', type: 'TEXT', unique: true, required: true },
            { key: 'mappings', displayName: 'Mappings JSON', type: 'TEXT' },
            { key: 'conflictResolution', displayName: 'Conflict Resolution', type: 'TEXT' },
          ],
          dataPermissions: {
            itemRead: 'PRIVILEGED',
            itemInsert: 'PRIVILEGED',
            itemUpdate: 'PRIVILEGED',
            itemRemove: 'PRIVILEGED',
          },
        },
        {
          schemaUrl: 'https://www.wix.com/',
          idSuffix: 'sync-mappings',
          displayName: 'Sync Mappings',
          displayField: 'siteId',
          fields: [
            { key: 'siteId', displayName: 'Site ID', type: 'TEXT', required: true },
            { key: 'wixContactId', displayName: 'Wix Contact ID', type: 'TEXT' },
            { key: 'hubspotContactId', displayName: 'HubSpot Contact ID', type: 'TEXT' },
            { key: 'lastSyncedAt', displayName: 'Last Synced At', type: 'DATETIME' },
            { key: 'lastSyncSource', displayName: 'Last Sync Source', type: 'TEXT' },
            { key: 'syncCorrelationId', displayName: 'Sync Correlation ID', type: 'TEXT' },
            { key: 'version', displayName: 'Version', type: 'NUMBER' },
          ],
          dataPermissions: {
            itemRead: 'PRIVILEGED',
            itemInsert: 'PRIVILEGED',
            itemUpdate: 'PRIVILEGED',
            itemRemove: 'PRIVILEGED',
          },
        },
        {
          schemaUrl: 'https://www.wix.com/',
          idSuffix: 'sync-logs',
          displayName: 'Sync Logs',
          displayField: 'siteId',
          fields: [
            { key: 'siteId', displayName: 'Site ID', type: 'TEXT', required: true },
            { key: 'syncCorrelationId', displayName: 'Sync Correlation ID', type: 'TEXT' },
            { key: 'source', displayName: 'Source', type: 'TEXT' },
            { key: 'action', displayName: 'Action', type: 'TEXT' },
            { key: 'status', displayName: 'Status', type: 'TEXT' },
            { key: 'wixContactId', displayName: 'Wix Contact ID', type: 'TEXT' },
            { key: 'hubspotContactId', displayName: 'HubSpot Contact ID', type: 'TEXT' },
            { key: 'error', displayName: 'Error', type: 'TEXT' },
            { key: 'metadata', displayName: 'Metadata JSON', type: 'TEXT' },
            { key: 'logTimestamp', displayName: 'Log Timestamp', type: 'DATETIME' },
          ],
          dataPermissions: {
            itemRead: 'PRIVILEGED',
            itemInsert: 'PRIVILEGED',
            itemUpdate: 'PRIVILEGED',
            itemRemove: 'PRIVILEGED',
          },
        },
      ],
    },
  },
});
