// HubSpot Connection
export interface HubSpotConnection {
  id?: number;
  siteId: string;
  hubspotAccountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  status: "connected" | "disconnected" | "error";
  connectedAt: Date;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldMapping {
  wixField: string;
  hubspotProperty: string;
  direction: "wix_to_hubspot" | "hubspot_to_wix" | "bidirectional";
  transform?: "trim" | "lowercase" | "uppercase" | "none";
  required?: boolean;
}

export interface FieldMappingConfig {
  id?: number;
  siteId: string;
  mappings: FieldMapping[];
  conflictResolution: "last_updated_wins" | "hubspot_wins" | "wix_wins";
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncMapping {
  id?: number;
  siteId: string;
  wixContactId?: string;
  hubspotContactId?: string;
  lastSyncedAt: Date;
  lastSyncSource: "wix" | "hubspot" | "wix_form";
  syncCorrelationId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncLog {
  id?: number;
  siteId: string;
  syncCorrelationId: string;
  source: "wix" | "hubspot" | "wix_form";
  action: "create" | "update" | "delete";
  status: "success" | "error" | "skipped";
  wixContactId?: string;
  hubspotContactId?: string;
  error?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface HubSpotContact {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface WixContact {
  _id: string;
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  updatedDate?: Date;
  createdDate?: Date;
  [key: string]: any;
}

export interface WixFormSubmission {
  formId: string;
  submissions: Array<{ fieldName: string; value: unknown }>;
  pageUrl?: string;
  referrer?: string;
  extendedFields?: Record<string, string>;
  referralInfo?: Record<string, string>;
  [key: string]: unknown;
}

export interface WixFormSubmissionEvent {
  formSubmission: WixFormSubmission;
  instanceId?: string;
}
