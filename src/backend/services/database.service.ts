import { items } from "@wix/data";
import { auth } from "@wix/essentials";
import type {
  HubSpotConnection,
  FieldMappingConfig,
  SyncMapping,
  SyncLog,
} from "../types/models";
import { logger } from "../utils/logger";
import { COLLECTIONS } from "../constants";

const { CONNECTIONS, FIELD_MAPPINGS, SYNC_MAPPINGS, SYNC_LOGS } = COLLECTIONS;

function elevatedInsert(...args: Parameters<typeof items.insert>) {
  return auth.elevate(items.insert)(...args);
}
function elevatedUpdate(...args: Parameters<typeof items.update>) {
  return auth.elevate(items.update)(...args);
}
function elevatedSave(...args: Parameters<typeof items.save>) {
  return auth.elevate(items.save)(...args);
}
function elevatedRemove(...args: Parameters<typeof items.remove>) {
  return auth.elevate(items.remove)(...args);
}
function elevatedQuery(...args: Parameters<typeof items.query>) {
  return auth.elevate(items.query)(...args);
}

export class DatabaseService {
  static async saveConnection(
    connection: Omit<HubSpotConnection, "id">,
  ): Promise<void> {
    const existing = await elevatedQuery(CONNECTIONS)
      .eq("siteId", connection.siteId)
      .find();

    const dataItem: Record<string, any> = {
      siteId: connection.siteId,
      hubspotAccountId: connection.hubspotAccountId,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
      scopes: JSON.stringify(connection.scopes),
      status: connection.status,
      connectedAt:
        connection.connectedAt instanceof Date
          ? connection.connectedAt
          : new Date(connection.connectedAt),
    };

    if (existing.items.length > 0) {
      dataItem._id = existing.items[0]._id;
    }

    await elevatedSave(CONNECTIONS, dataItem);
    logger.info("Connection saved", { siteId: connection.siteId });
  }

  static async getConnection(
    siteId: string,
  ): Promise<HubSpotConnection | null> {
    const result = await elevatedQuery(CONNECTIONS).eq("siteId", siteId).find();

    if (result.items.length === 0) return null;

    const item = result.items[0] as Record<string, any>;
    return DatabaseService.mapConnectionItem(item);
  }

  static async getActiveConnection(): Promise<HubSpotConnection | null> {
    const result = await elevatedQuery(CONNECTIONS)
      .eq("status", "connected")
      .find();

    if (result.items.length === 0) return null;

    const item = result.items[0] as Record<string, any>;
    return DatabaseService.mapConnectionItem(item);
  }

  private static mapConnectionItem(
    item: Record<string, any>,
  ): HubSpotConnection {
    return {
      siteId: item.siteId,
      hubspotAccountId: item.hubspotAccountId,
      accessToken: item.accessToken,
      refreshToken: item.refreshToken,
      expiresAt: item.expiresAt,
      scopes: JSON.parse(item.scopes || "[]"),
      status: item.status as "connected" | "disconnected" | "error",
      connectedAt: new Date(item.connectedAt),
      lastSyncAt: item.lastSyncAt ? new Date(item.lastSyncAt) : undefined,
      createdAt: new Date(item._createdDate),
      updatedAt: new Date(item._updatedDate),
    };
  }

  static async updateConnectionTokens(
    siteId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
  ): Promise<void> {
    const result = await elevatedQuery(CONNECTIONS).eq("siteId", siteId).find();

    if (result.items.length === 0) return;

    const item = result.items[0] as Record<string, any>;
    await elevatedUpdate(CONNECTIONS, {
      ...item,
      accessToken,
      refreshToken,
      expiresAt,
    });
  }

  static async deleteConnection(siteId: string): Promise<void> {
    const result = await elevatedQuery(CONNECTIONS).eq("siteId", siteId).find();

    if (result.items.length > 0) {
      await elevatedRemove(CONNECTIONS, result.items[0]._id!);
    }
    logger.info("Connection deleted", { siteId });
  }

  static async getConnectionByHubSpotAccount(
    hubspotAccountId: string,
  ): Promise<HubSpotConnection | null> {
    const result = await elevatedQuery(CONNECTIONS)
      .eq("hubspotAccountId", hubspotAccountId)
      .eq("status", "connected")
      .limit(1)
      .find();

    if (result.items.length === 0) return null;

    const item = result.items[0] as Record<string, any>;
    return {
      siteId: item.siteId,
      hubspotAccountId: item.hubspotAccountId,
      accessToken: item.accessToken,
      refreshToken: item.refreshToken,
      expiresAt: item.expiresAt,
      scopes: JSON.parse(item.scopes || "[]"),
      status: item.status as "connected" | "disconnected" | "error",
      connectedAt: new Date(item.connectedAt),
      lastSyncAt: item.lastSyncAt ? new Date(item.lastSyncAt) : undefined,
      createdAt: new Date(item._createdDate),
      updatedAt: new Date(item._updatedDate),
    };
  }

  static async saveFieldMappings(
    config: Omit<FieldMappingConfig, "id">,
  ): Promise<void> {
    const existing = await elevatedQuery(FIELD_MAPPINGS)
      .eq("siteId", config.siteId)
      .find();

    const dataItem: Record<string, any> = {
      siteId: config.siteId,
      mappings: JSON.stringify(config.mappings),
      conflictResolution: config.conflictResolution,
    };

    if (existing.items.length > 0) {
      dataItem._id = existing.items[0]._id;
    }

    await elevatedSave(FIELD_MAPPINGS, dataItem);
    logger.info("Field mappings saved", {
      siteId: config.siteId,
      count: config.mappings.length,
    });
  }

  static async getFieldMappings(
    siteId: string,
  ): Promise<FieldMappingConfig | null> {
    const result = await elevatedQuery(FIELD_MAPPINGS)
      .eq("siteId", siteId)
      .find();

    if (result.items.length === 0) return null;

    const item = result.items[0] as Record<string, any>;
    return {
      siteId: item.siteId,
      mappings: JSON.parse(item.mappings || "[]"),
      conflictResolution: item.conflictResolution as
        | "last_updated_wins"
        | "hubspot_wins"
        | "wix_wins",
      createdAt: new Date(item._createdDate),
      updatedAt: new Date(item._updatedDate),
    };
  }

  static async saveSyncMapping(
    mapping: Omit<SyncMapping, "id">,
  ): Promise<void> {
    const lastSyncedAt =
      mapping.lastSyncedAt instanceof Date
        ? mapping.lastSyncedAt
        : new Date(mapping.lastSyncedAt);

    // Try to find existing mapping by wixContactId or hubspotContactId
    let existingItem: Record<string, any> | null = null;

    if (mapping.wixContactId) {
      const result = await elevatedQuery(SYNC_MAPPINGS)
        .eq("siteId", mapping.siteId)
        .eq("wixContactId", mapping.wixContactId)
        .find();
      if (result.items.length > 0) {
        existingItem = result.items[0] as Record<string, any>;
      }
    }

    if (!existingItem && mapping.hubspotContactId) {
      const result = await elevatedQuery(SYNC_MAPPINGS)
        .eq("siteId", mapping.siteId)
        .eq("hubspotContactId", mapping.hubspotContactId)
        .find();
      if (result.items.length > 0) {
        existingItem = result.items[0] as Record<string, any>;
      }
    }

    const dataItem: Record<string, any> = {
      siteId: mapping.siteId,
      wixContactId: mapping.wixContactId || null,
      hubspotContactId: mapping.hubspotContactId || null,
      lastSyncedAt,
      lastSyncSource: mapping.lastSyncSource,
      syncCorrelationId: mapping.syncCorrelationId,
      version: mapping.version,
    };

    if (existingItem) {
      dataItem._id = existingItem._id;
    }

    await elevatedSave(SYNC_MAPPINGS, dataItem);
  }

  static async getSyncMappingByWixId(
    siteId: string,
    wixContactId: string,
  ): Promise<SyncMapping | null> {
    const result = await elevatedQuery(SYNC_MAPPINGS)
      .eq("siteId", siteId)
      .eq("wixContactId", wixContactId)
      .find();

    if (result.items.length === 0) return null;
    return this.itemToSyncMapping(result.items[0] as Record<string, any>);
  }

  static async getSyncMappingByHubSpotId(
    siteId: string,
    hubspotContactId: string,
  ): Promise<SyncMapping | null> {
    const result = await elevatedQuery(SYNC_MAPPINGS)
      .eq("siteId", siteId)
      .eq("hubspotContactId", hubspotContactId)
      .find();

    if (result.items.length === 0) return null;
    return this.itemToSyncMapping(result.items[0] as Record<string, any>);
  }

  static async getSyncMappingByCorrelationId(
    correlationId: string,
  ): Promise<SyncMapping | null> {
    const result = await elevatedQuery(SYNC_MAPPINGS)
      .eq("syncCorrelationId", correlationId)
      .find();

    if (result.items.length === 0) return null;
    return this.itemToSyncMapping(result.items[0] as Record<string, any>);
  }

  private static itemToSyncMapping(item: Record<string, any>): SyncMapping {
    return {
      siteId: item.siteId,
      wixContactId: item.wixContactId || undefined,
      hubspotContactId: item.hubspotContactId || undefined,
      lastSyncedAt: new Date(item.lastSyncedAt),
      lastSyncSource: item.lastSyncSource as "wix" | "hubspot" | "wix_form",
      syncCorrelationId: item.syncCorrelationId,
      version: item.version,
      createdAt: new Date(item._createdDate),
      updatedAt: new Date(item._updatedDate),
    };
  }

  static async createSyncLog(log: Omit<SyncLog, "id">): Promise<void> {
    await elevatedInsert(SYNC_LOGS, {
      siteId: log.siteId,
      syncCorrelationId: log.syncCorrelationId,
      source: log.source,
      action: log.action,
      status: log.status,
      wixContactId: log.wixContactId || null,
      hubspotContactId: log.hubspotContactId || null,
      error: log.error || null,
      metadata: log.metadata ? JSON.stringify(log.metadata) : null,
      logTimestamp: new Date(),
    });
  }

  static async getSyncLogs(
    siteId: string,
    limit: number = 50,
  ): Promise<SyncLog[]> {
    const result = await elevatedQuery(SYNC_LOGS)
      .eq("siteId", siteId)
      .descending("logTimestamp")
      .limit(limit)
      .find();

    return result.items.map((item: Record<string, any>) => ({
      siteId: item.siteId,
      syncCorrelationId: item.syncCorrelationId,
      source: item.source as "wix" | "hubspot" | "wix_form",
      action: item.action as "create" | "update" | "delete",
      status: item.status as "success" | "error" | "skipped",
      wixContactId: item.wixContactId || undefined,
      hubspotContactId: item.hubspotContactId || undefined,
      error: item.error || undefined,
      metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
      timestamp: new Date(item.logTimestamp),
    }));
  }

  static async getSyncStats(siteId: string): Promise<{
    total: number;
    success: number;
    error: number;
    skipped: number;
    lastSync?: Date;
  }> {
    const [successCount, errorCount, skippedCount, lastLog] = await Promise.all(
      [
        elevatedQuery(SYNC_LOGS)
          .eq("siteId", siteId)
          .eq("status", "success")
          .count(),
        elevatedQuery(SYNC_LOGS)
          .eq("siteId", siteId)
          .eq("status", "error")
          .count(),
        elevatedQuery(SYNC_LOGS)
          .eq("siteId", siteId)
          .eq("status", "skipped")
          .count(),
        elevatedQuery(SYNC_LOGS)
          .eq("siteId", siteId)
          .descending("logTimestamp")
          .limit(1)
          .find(),
      ],
    );

    return {
      total: successCount + errorCount + skippedCount,
      success: successCount,
      error: errorCount,
      skipped: skippedCount,
      lastSync:
        lastLog.items.length > 0
          ? new Date((lastLog.items[0] as Record<string, any>).logTimestamp)
          : undefined,
    };
  }
}
