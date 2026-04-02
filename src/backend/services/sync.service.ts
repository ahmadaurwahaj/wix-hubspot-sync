import { v4 as uuidv4 } from 'uuid';
import { HubSpotService } from './hubspot.service';
import { DatabaseService } from './database.service';
import { WixContactsService } from './wix-contacts.service';
import { logger } from '../utils/logger';
import type { WixContact, HubSpotContact, FieldMapping, WixFormSubmissionEvent } from '../types/models';


const recentSyncs = new Map<string, number>();
const DEDUPLICATION_WINDOW = 30000; // 30 seconds

export class SyncService {
  private siteId: string;
  private hubspotService: HubSpotService;

  constructor(siteId: string, accessToken: string) {
    this.siteId = siteId;
    this.hubspotService = new HubSpotService(accessToken);
  }


  private shouldProcessSync(contactId: string): boolean {
    const lastSync = recentSyncs.get(contactId);
    const now = Date.now();

    if (lastSync && (now - lastSync) < DEDUPLICATION_WINDOW) {
      logger.debug('Skipping sync - within deduplication window', { contactId });
      return false;
    }

    recentSyncs.set(contactId, now);
    

    if (recentSyncs.size > 1000) {
      const cutoff = now - DEDUPLICATION_WINDOW;
      for (const [key, value] of recentSyncs.entries()) {
        if (value < cutoff) {
          recentSyncs.delete(key);
        }
      }
    }

    return true;
  }

  /**
   * Transform field value based on mapping configuration
   */
  private transformValue(value: any, transform?: string): string {
    if (!value) return '';
    
    const strValue = String(value);
    
    switch (transform) {
      case 'trim':
        return strValue.trim();
      case 'lowercase':
        return strValue.toLowerCase();
      case 'uppercase':
        return strValue.toUpperCase();
      default:
        return strValue;
    }
  }

  /**
   * Map Wix contact fields to HubSpot properties
   */
  private mapWixToHubSpot(
    wixContact: WixContact,
    mappings: FieldMapping[]
  ): Record<string, string> {
    const properties: Record<string, string> = {};

    for (const mapping of mappings) {
      if (mapping.direction === 'hubspot_to_wix') {
        continue; // Skip reverse-only mappings
      }

      const wixValue = wixContact[mapping.wixField];
      if (wixValue !== undefined && wixValue !== null) {
        properties[mapping.hubspotProperty] = this.transformValue(
          wixValue,
          mapping.transform
        );
      }
    }

    return properties;
  }

  /**
   * Map HubSpot properties to Wix contact fields
   */
  private mapHubSpotToWix(
    hubspotContact: HubSpotContact,
    mappings: FieldMapping[]
  ): Partial<WixContact> {
    const fields: Partial<WixContact> = {};

    for (const mapping of mappings) {
      if (mapping.direction === 'wix_to_hubspot') {
        continue; 
      }

      const hubspotValue = hubspotContact.properties[mapping.hubspotProperty];
      if (hubspotValue !== undefined && hubspotValue !== null) {
        fields[mapping.wixField] = this.transformValue(
          hubspotValue,
          mapping.transform
        );
      }
    }

    return fields;
  }

  /**
   * Detect changes between two objects
   */
  private detectChanges(
    source: Record<string, any>,
    target: Record<string, any>,
    fields: string[]
  ): Record<string, any> {
    const changes: Record<string, any> = {};

    for (const field of fields) {
      const sourceValue = String(source[field] || '').trim();
      const targetValue = String(target[field] || '').trim();

      if (sourceValue !== targetValue) {
        changes[field] = source[field];
      }
    }

    return changes;
  }

  /**
   * Resolve conflict between Wix and HubSpot updates
   */
  private async resolveConflict(
    wixContact: WixContact,
    hubspotContact: HubSpotContact,
    strategy: string
  ): Promise<'wix' | 'hubspot'> {
    if (strategy === 'wix_wins') {
      return 'wix';
    }
    
    if (strategy === 'hubspot_wins') {
      return 'hubspot';
    }

    // Last updated wins (default)
    const wixUpdated = wixContact.updatedDate 
      ? new Date(wixContact.updatedDate).getTime()
      : 0;
    const hubspotUpdated = hubspotContact.updatedAt
      ? new Date(hubspotContact.updatedAt).getTime()
      : 0;

    return wixUpdated > hubspotUpdated ? 'wix' : 'hubspot';
  }

  /**
   * Sync Wix contact to HubSpot
   */
  async syncWixToHubSpot(
    wixContact: WixContact,
    correlationId?: string
  ): Promise<void> {
    const syncId = correlationId || uuidv4();

    try {
      if (!this.shouldProcessSync(`wix-${wixContact._id}`)) {
        await DatabaseService.createSyncLog({
          siteId: this.siteId,
          syncCorrelationId: syncId,
          source: 'wix',
          action: 'update',
          status: 'skipped',
          wixContactId: wixContact._id,
          timestamp: new Date(),
        });
        return;
      }

      const config = await DatabaseService.getFieldMappings(this.siteId);
      if (!config || config.mappings.length === 0) {
        logger.warn('No field mappings configured', { siteId: this.siteId });
        return;
      }

      const wixToHsMappings = config.mappings.filter(
        m => m.direction === 'wix_to_hubspot' || m.direction === 'bidirectional'
      );
      if (wixToHsMappings.length === 0) {
        logger.debug('No mappings allow Wix→HubSpot direction, skipping', {
          wixContactId: wixContact._id,
        });
        return;
      }

      
      const existingMapping = await DatabaseService.getSyncMappingByWixId(
        this.siteId,
        wixContact._id
      );


      if (existingMapping && existingMapping.syncCorrelationId === correlationId) {
        logger.debug('Ignoring self-generated sync event', { correlationId });
        return;
      }

      const hubspotProperties = this.mapWixToHubSpot(wixContact, config.mappings);

      if (Object.keys(hubspotProperties).length === 0) {
        logger.warn('No properties to sync', { wixContactId: wixContact._id });
        return;
      }

      let hubspotContactId: string;
      let action: 'create' | 'update';
      let hubspotUpdatedAt: Date;

      if (existingMapping?.hubspotContactId) {
        let hubspotContact: HubSpotContact;
        try {
          hubspotContact = await this.hubspotService.getContact(
            existingMapping.hubspotContactId
          );
        } catch (err: any) {
          if (err?.message?.includes('Not Found') || err?.status === 404) {
            logger.warn('Mapped HubSpot contact not found, creating new one', {
              wixContactId: wixContact._id,
              hubspotContactId: existingMapping.hubspotContactId,
            });
            const email = hubspotProperties.email || wixContact.emailAddress;
            if (!email) {
              throw new Error('Email is required to create HubSpot contact');
            }
            const newContact = await this.hubspotService.createOrUpdateContact(
              email,
              hubspotProperties
            );
            await DatabaseService.saveSyncMapping({
              siteId: this.siteId,
              wixContactId: wixContact._id,
              hubspotContactId: newContact.id,
              lastSyncedAt: new Date(newContact.updatedAt),
              lastSyncSource: 'wix',
              syncCorrelationId: syncId,
              version: (existingMapping.version || 0) + 1,
              createdAt: existingMapping.createdAt || new Date(),
              updatedAt: new Date(),
            });
            await DatabaseService.createSyncLog({
              siteId: this.siteId,
              syncCorrelationId: syncId,
              source: 'wix',
              action: 'create',
              status: 'success',
              wixContactId: wixContact._id,
              hubspotContactId: newContact.id,
              timestamp: new Date(),
            });
            return;
          }
          throw err;
        }
        const winner = await this.resolveConflict(
          wixContact,
          hubspotContact,
          config.conflictResolution,
        );
        if (winner !== 'wix') {
          logger.debug('Conflict resolved in favour of HubSpot, skipping Wix→HS sync', {
            wixContactId: wixContact._id,
          });
          await DatabaseService.createSyncLog({
            siteId: this.siteId,
            syncCorrelationId: syncId,
            source: 'wix',
            action: 'update',
            status: 'skipped',
            wixContactId: wixContact._id,
            hubspotContactId: existingMapping.hubspotContactId,
            timestamp: new Date(),
          });
          return;
        }

        const propertyKeys = Object.keys(hubspotProperties);
        const changes = this.detectChanges(
          hubspotProperties,
          hubspotContact.properties,
          propertyKeys
        );

        if (Object.keys(changes).length === 0) {
          logger.debug('No changes detected, skipping sync', {
            wixContactId: wixContact._id,
          });
          
          await DatabaseService.createSyncLog({
            siteId: this.siteId,
            syncCorrelationId: syncId,
            source: 'wix',
            action: 'update',
            status: 'skipped',
            wixContactId: wixContact._id,
            hubspotContactId: existingMapping.hubspotContactId,
            timestamp: new Date(),
          });
          return;
        }

        const updatedHsContact = await this.hubspotService.updateContact(
          existingMapping.hubspotContactId,
          changes
        );
        hubspotContactId = existingMapping.hubspotContactId;
        hubspotUpdatedAt = new Date(updatedHsContact.updatedAt);
        action = 'update';
      } else {
        // Create new HubSpot contact
        const email = hubspotProperties.email || wixContact.emailAddress;
        if (!email) {
          throw new Error('Email is required to create HubSpot contact');
        }

        const newContact = await this.hubspotService.createOrUpdateContact(
          email,
          hubspotProperties
        );
        hubspotContactId = newContact.id;
        hubspotUpdatedAt = new Date(newContact.updatedAt);
        action = 'create';
      }

      await DatabaseService.saveSyncMapping({
        siteId: this.siteId,
        wixContactId: wixContact._id,
        hubspotContactId,
        lastSyncedAt: hubspotUpdatedAt,
        lastSyncSource: 'wix',
        syncCorrelationId: syncId,
        version: existingMapping ? (existingMapping.version || 0) + 1 : 1,
        createdAt: existingMapping?.createdAt || new Date(),
        updatedAt: new Date(),
      });

      await DatabaseService.createSyncLog({
        siteId: this.siteId,
        syncCorrelationId: syncId,
        source: 'wix',
        action,
        status: 'success',
        wixContactId: wixContact._id,
        hubspotContactId,
        timestamp: new Date(),
      });

      logger.info('Wix to HubSpot sync completed', {
        wixContactId: wixContact._id,
        hubspotContactId,
        action,
      });
    } catch (error) {
      logger.error('Wix to HubSpot sync failed', error);

      await DatabaseService.createSyncLog({
        siteId: this.siteId,
        syncCorrelationId: syncId,
        source: 'wix',
        action: 'update',
        status: 'error',
        wixContactId: wixContact._id,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Sync HubSpot contact to Wix
   */
  async syncHubSpotToWix(
    hubspotContact: HubSpotContact,
    correlationId?: string
  ): Promise<void> {
    const syncId = correlationId || uuidv4();

    try {
      if (!this.shouldProcessSync(`hubspot-${hubspotContact.id}`)) {
        await DatabaseService.createSyncLog({
          siteId: this.siteId,
          syncCorrelationId: syncId,
          source: 'hubspot',
          action: 'update',
          status: 'skipped',
          hubspotContactId: hubspotContact.id,
          timestamp: new Date(),
        });
        return;
      }

      const config = await DatabaseService.getFieldMappings(this.siteId);
      if (!config || config.mappings.length === 0) {
        logger.warn('No field mappings configured', { siteId: this.siteId });
        return;
      }

      const hsToWixMappings = config.mappings.filter(
        m => m.direction === 'hubspot_to_wix' || m.direction === 'bidirectional'
      );
      if (hsToWixMappings.length === 0) {
        logger.debug('No mappings allow HubSpot→Wix direction, skipping', {
          hubspotContactId: hubspotContact.id,
        });
        return;
      }

      const existingMapping = await DatabaseService.getSyncMappingByHubSpotId(
        this.siteId,
        hubspotContact.id
      );

      if (existingMapping && existingMapping.syncCorrelationId === correlationId) {
        logger.debug('Ignoring self-generated sync event', { correlationId });
        return;
      }

      const wixFields = this.mapHubSpotToWix(hubspotContact, config.mappings);

      if (Object.keys(wixFields).length === 0) {
        logger.warn('No fields to sync', { hubspotContactId: hubspotContact.id });
        return;
      }

      const wixToken = await WixContactsService.getAppAccessToken(this.siteId);
      const wixService = new WixContactsService(wixToken);
      const wixContactInfo = WixContactsService.toWixContactInfo(wixFields as Record<string, string>);

      let wixContactId: string;
      let action: 'create' | 'update';

      if (existingMapping?.wixContactId) {
        let existingWixContact: any;
        try {
          existingWixContact = await wixService.getContact(existingMapping.wixContactId);
        } catch {
          existingWixContact = null;
        }

        if (existingWixContact) {
          const pseudoWix: WixContact = {
            _id: existingMapping.wixContactId,
            updatedDate: existingWixContact.updatedDate
              ? new Date(existingWixContact.updatedDate)
              : undefined,
          };
          const winner = await this.resolveConflict(pseudoWix, hubspotContact, config.conflictResolution);
          if (winner !== 'hubspot') {
            logger.debug('Conflict resolved in favour of Wix, skipping HS→Wix sync', {
              hubspotContactId: hubspotContact.id,
            });
            await DatabaseService.createSyncLog({
              siteId: this.siteId,
              syncCorrelationId: syncId,
              source: 'hubspot',
              action: 'update',
              status: 'skipped',
              hubspotContactId: hubspotContact.id,
              wixContactId: existingMapping.wixContactId,
              timestamp: new Date(),
            });
            return;
          }

          const updated = await wixService.updateContact(
            existingMapping.wixContactId,
            existingWixContact.revision ?? 1,
            wixContactInfo,
          );
          wixContactId = updated.id;
          action = 'update';
        } else {

          const created = await wixService.createContact(wixContactInfo);
          wixContactId = created.id;
          action = 'create';
        }
      } else {
        const email = hubspotContact.properties?.email;
        let existing: Awaited<ReturnType<typeof wixService.queryContactByEmail>> = null;

        if (email) {
          try {
            existing = await wixService.queryContactByEmail(email);
          } catch { /* ignore search errors */ }
        }

        if (existing) {
          const updated = await wixService.updateContact(existing.id, existing.revision, wixContactInfo);
          wixContactId = updated.id;
          action = 'update';
        } else {
          const created = await wixService.createContact(wixContactInfo);
          wixContactId = created.id;
          action = 'create';
        }
      }


      await DatabaseService.saveSyncMapping({
        siteId: this.siteId,
        wixContactId,
        hubspotContactId: hubspotContact.id,
        lastSyncedAt: new Date(),
        lastSyncSource: 'hubspot',
        syncCorrelationId: syncId,
        version: existingMapping ? (existingMapping.version || 0) + 1 : 1,
        createdAt: existingMapping?.createdAt || new Date(),
        updatedAt: new Date(),
      });

      // Log success
      await DatabaseService.createSyncLog({
        siteId: this.siteId,
        syncCorrelationId: syncId,
        source: 'hubspot',
        action: 'update',
        status: 'success',
        wixContactId: existingMapping?.wixContactId,
        hubspotContactId: hubspotContact.id,
        timestamp: new Date(),
      });

      logger.info('HubSpot to Wix sync completed', {
        hubspotContactId: hubspotContact.id,
      });
    } catch (error) {
      logger.error('HubSpot to Wix sync failed', error);

      await DatabaseService.createSyncLog({
        siteId: this.siteId,
        syncCorrelationId: syncId,
        source: 'hubspot',
        action: 'update',
        status: 'error',
        hubspotContactId: hubspotContact.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });

      throw error;
    }
  }

  /**
   * Perform initial bulk sync — fetches all HubSpot contacts and syncs to Wix,
   * then syncs any un-mapped Wix contacts to HubSpot.
   */
  async performBulkSync(): Promise<{ synced: number; errors: number }> {
    logger.info('Starting bulk sync', { siteId: this.siteId });

    let synced = 0;
    let errors = 0;

    try {

      const config = await DatabaseService.getFieldMappings(this.siteId);
      if (!config || config.mappings.length === 0) {
        logger.warn('No field mappings configured, skipping bulk sync');
        return { synced: 0, errors: 0 };
      }


      let after: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const result = await this.hubspotService.listContacts(after);
        const contacts: HubSpotContact[] = result.results ?? [];

        for (const contact of contacts) {
          try {
            await this.syncHubSpotToWix(contact, `bulk-${uuidv4()}`);
            synced++;
          } catch (err) {
            errors++;
            logger.error('Bulk sync error (HS→Wix)', { contactId: contact.id, err });
          }
        }

        after = result.paging?.next?.after;
        hasMore = !!after;
      }

  
      try {
        const wixToken = await WixContactsService.getAppAccessToken(this.siteId);
        const wixService = new WixContactsService(wixToken);
        let offset = 0;
        let hasMoreWix = true;

        while (hasMoreWix) {
          const wixResult = await wixService.listContacts(offset);
          const wixContacts = wixResult.contacts ?? [];

          for (const rawContact of wixContacts) {
            try {

              const flatContact = WixContactsService.fromWixContact(rawContact) as WixContact;
              await this.syncWixToHubSpot(flatContact, `bulk-${uuidv4()}`);
              synced++;
            } catch (err) {
              errors++;
              logger.error('Bulk sync error (Wix→HS)', { contactId: rawContact.id, err });
            }
          }

          offset += wixContacts.length;
          hasMoreWix = wixResult.pagingMetadata?.hasNext ?? false;
        }
      } catch (err) {
        logger.error('Phase 2 (Wix→HubSpot) failed', err);
      }

      logger.info('Bulk sync completed', { siteId: this.siteId, synced, errors });
    } catch (error) {
      logger.error('Bulk sync failed', error);
      throw error;
    }

    return { synced, errors };
  }

  /**
   * Submit Wix form data to HubSpot as a contact.
   * Creates or updates a HubSpot contact with form fields and UTM attribution.
   */
  static async submitFormToHubSpot(
    event: WixFormSubmissionEvent,
    siteId: string,
    accessToken: string
  ): Promise<void> {
    const correlationId = uuidv4();
    const hubspotService = new HubSpotService(accessToken);

    try {
      // Extract form fields from submissions array
      const fields = SyncService.extractFormFields(event);

      // Get email - required for HubSpot contact
      // Handle suffixed field names generated by Wix Forms (e.g. "email_d952")
      const email = fields['email'] ?? fields['Email'] ?? fields['email_address'] ?? fields['emailAddress']
        ?? Object.entries(fields).find(([k]) => /^email/i.test(k))?.[1];
      if (!email) {
        logger.warn('Form submission missing email field, skipping HubSpot sync', {
          formId: event.formSubmission?.formId,
        });
        return;
      }

      // Parse name fields
      const nameFull = fields['name'] ?? fields['Name'] ?? fields['full_name'] ?? fields['fullName'] ?? '';
      const [firstFromName = '', ...restName] = nameFull.split(' ');

      // Build HubSpot properties
      const properties: Record<string, string> = {
        email,
        firstname: fields['firstName'] ?? fields['first_name'] ?? fields['firstname'] ?? firstFromName,
        lastname: fields['lastName'] ?? fields['last_name'] ?? fields['lastname'] ?? restName.join(' '),
      };

      // Add phone if present
      const phone = fields['phone'] ?? fields['Phone'] ?? fields['phone_number'] ?? fields['phoneNumber'];
      if (phone) {
        properties['phone'] = phone;
      }

      // Add company if present
      const company = fields['company'] ?? fields['Company'] ?? fields['company_name'] ?? fields['companyName'];
      if (company) {
        properties['company'] = company;
      }

      // UTM attribution - check submissions, extendedFields, and referralInfo
      const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      for (const utm of utmParams) {
        const val =
          fields[utm] ??
          event.formSubmission?.extendedFields?.[utm] ??
          event.formSubmission?.referralInfo?.[utm];
        if (val) {
          properties[utm] = String(val);
        }
      }

      // Page URL and referrer for attribution tracking
      if (event.formSubmission?.pageUrl) {
        properties['hs_analytics_last_url'] = event.formSubmission.pageUrl;
        
        // Parse UTMs from page URL if not already present
        try {
          const url = new URL(event.formSubmission.pageUrl);
          for (const utm of utmParams) {
            if (!properties[utm] && url.searchParams.has(utm)) {
              properties[utm] = url.searchParams.get(utm)!;
            }
          }
        } catch {
          // Invalid URL, skip parsing
        }
      }

      if (event.formSubmission?.referrer) {
        properties['hs_analytics_last_referrer'] = event.formSubmission.referrer;
      }

      // Mark source as offline (form submission)
      properties['hs_analytics_source'] = 'OFFLINE';

      // Create or update the HubSpot contact
      const result = await hubspotService.createOrUpdateContact(email, properties);

      // Log success
      await DatabaseService.createSyncLog({
        siteId,
        syncCorrelationId: correlationId,
        source: 'wix_form',
        action: 'create',
        status: 'success',
        hubspotContactId: result.id,
        metadata: {
          formId: event.formSubmission?.formId,
          email,
        },
        timestamp: new Date(),
      });

      logger.info('Form submission synced to HubSpot', {
        formId: event.formSubmission?.formId,
        hubspotContactId: result.id,
        email,
      });
    } catch (error) {
      logger.error('Form submission to HubSpot failed', error);

      await DatabaseService.createSyncLog({
        siteId,
        syncCorrelationId: correlationId,
        source: 'wix_form',
        action: 'create',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          formId: event.formSubmission?.formId,
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Extract form field values from Wix form submission event
   */
  private static extractFormFields(event: WixFormSubmissionEvent): Record<string, string> {
    const fields: Record<string, string> = {};

    const submissions =
      event.formSubmission?.submissions ??
      (event as any)?.submissions ??
      [];

    // Handle both formats:
    // 1. Key-value object from raw webhook: { "first_name": "Baxter", "email_d952": "..." }
    // 2. Array from SDK-normalized event: [{ fieldName: "first_name", value: "Baxter" }]
    if (Array.isArray(submissions)) {
      for (const sub of submissions) {
        if (sub.fieldName && sub.value !== undefined && sub.value !== null) {
          fields[sub.fieldName] = String(sub.value);
        }
      }
    } else if (typeof submissions === 'object' && submissions !== null) {
      for (const [key, value] of Object.entries(submissions)) {
        if (value !== undefined && value !== null) {
          fields[key] = String(value);
        }
      }
    }

    return fields;
  }
}
