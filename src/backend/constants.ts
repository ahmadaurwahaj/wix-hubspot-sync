export const APP_NAMESPACE = import.meta.env.APP_NAMESPACE ?? '@zohaibahmad7/wh-integration';

export const COLLECTIONS = {
  CONNECTIONS: `${APP_NAMESPACE}/connections`,
  FIELD_MAPPINGS: `${APP_NAMESPACE}/field-mappings`,
  SYNC_MAPPINGS: `${APP_NAMESPACE}/sync-mappings`,
  SYNC_LOGS: `${APP_NAMESPACE}/sync-logs`,
} as const;
