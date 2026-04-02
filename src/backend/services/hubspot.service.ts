import { logger } from '../utils/logger';
import { getSecret } from '../utils/secrets';
import type { HubSpotTokenResponse, HubSpotContact } from '../types/models';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export class HubSpotService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }


  static async getAuthorizationUrl(redirectUri: string, state?: string): Promise<string> {
    const clientId = await getSecret('HUBSPOT_CLIENT_ID');
    const scopes = [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.schemas.contacts.read',
      'crm.schemas.contacts.write',
      'forms',
      'oauth',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
    });


    if (state) {
      params.set('state', state);
    }

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  }

  static async exchangeCodeForTokens(code: string, redirectUri: string): Promise<HubSpotTokenResponse> {
    const clientId = await getSecret('HUBSPOT_CLIENT_ID');
    const clientSecret = await getSecret('HUBSPOT_CLIENT_SECRET');

    const response = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to exchange code for tokens', { status: response.status, error });
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    return response.json();
  }

  static async refreshAccessToken(refreshToken: string): Promise<HubSpotTokenResponse> {
    const clientId = await getSecret('HUBSPOT_CLIENT_ID');
    const clientSecret = await getSecret('HUBSPOT_CLIENT_SECRET');

    const response = await fetch(`${HUBSPOT_API_BASE}/oauth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to refresh access token', { status: response.status });
      throw new Error(`Token refresh failed: ${error}`);
    }

    return response.json();
  }

  // Contact Methods
  async getContact(contactId: string): Promise<HubSpotContact> {
    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${contactId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get contact: ${response.statusText}`);
    }

    return response.json();
  }

  async createContact(properties: Record<string, string>): Promise<HubSpotContact> {
    logger.info('Creating HubSpot contact', { email: properties.email });

    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to create contact', { status: response.status, error });
      throw new Error(`Failed to create contact: ${error}`);
    }

    const contact = await response.json();
    logger.info('Contact created successfully', { contactId: contact.id });
    return contact;
  }

  async updateContact(contactId: string, properties: Record<string, string>): Promise<HubSpotContact> {
    logger.info('Updating HubSpot contact', { contactId });

    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts/${contactId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error('Failed to update contact', { contactId, status: response.status });
      throw new Error(`Failed to update contact: ${error}`);
    }

    return response.json();
  }

  async searchContactByEmail(email: string): Promise<HubSpotContact | null> {
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to search contact: ${response.statusText}`);
    }

    const result = await response.json();
    return result.results?.[0] || null;
  }

  async getContactProperties(): Promise<any[]> {
    const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/properties/contacts`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get contact properties: ${response.statusText}`);
    }

    const result = await response.json();
    return result.results || [];
  }


  private static readonly STANDARD_PROPERTIES = new Set([
    'email', 'firstname', 'lastname', 'phone', 'company',
    'jobtitle', 'website', 'address', 'city', 'state', 'zip', 'country',
    'lifecyclestage', 'hs_lead_status',
  ]);

  async createOrUpdateContact(email: string, properties: Record<string, string>): Promise<HubSpotContact> {
  
    const existing = await this.searchContactByEmail(email);
    
    try {
      if (existing) {
        return await this.updateContact(existing.id, properties);
      } else {
        return await this.createContact({ ...properties, email });
      }
    } catch (error: any) {
      const errMsg = error?.message || '';
      
     
      if (errMsg.includes('does not exist') || errMsg.includes('PROPERTY_DOESNT_EXIST')) {
       
        const customProps = Object.keys(properties).filter(
          p => !HubSpotService.STANDARD_PROPERTIES.has(p)
        );

        if (customProps.length > 0) {
          logger.info('Attempting to create missing HubSpot custom properties', { properties: customProps });
          await this.ensureCustomProperties(customProps);

        
          try {
            if (existing) {
              return await this.updateContact(existing.id, properties);
            } else {
              return await this.createContact({ ...properties, email });
            }
          } catch (retryError: any) {
       
            logger.warn('Retry with custom properties failed, falling back to standard only', {
              error: retryError?.message,
            });
          }
        }

     
        const standardOnly: Record<string, string> = {};
        for (const [key, value] of Object.entries(properties)) {
          if (HubSpotService.STANDARD_PROPERTIES.has(key)) {
            standardOnly[key] = value;
          }
        }

        logger.info('Saving contact with standard properties only', {
          email,
          standardProps: Object.keys(standardOnly),
          skippedCustomProps: customProps,
        });

        if (existing) {
          return await this.updateContact(existing.id, standardOnly);
        } else {
          return await this.createContact({ ...standardOnly, email });
        }
      }
      
      throw error;
    }
  }


  async ensureCustomProperties(propertyNames: string[]): Promise<void> {
    for (const name of propertyNames) {
      try {
        const label = name
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        const response = await fetch(
          `${HUBSPOT_API_BASE}/crm/v3/properties/contacts`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              label,
              type: 'string',
              fieldType: 'text',
              groupName: 'contactinformation',
            }),
          }
        );

        if (response.ok) {
          logger.info('Created HubSpot property', { name });
        } else {
          const err = await response.text();
          // 409 = already exists, that's fine
          if (response.status !== 409) {
            logger.warn('Failed to create HubSpot property', { name, status: response.status, err });
          }
        }
      } catch (err) {
        logger.warn('Error creating HubSpot property', { name, err });
      }
    }
  }


  async listContacts(
    after?: string,
    limit = 100,
  ): Promise<{ results: HubSpotContact[]; paging?: { next?: { after: string } } }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (after) params.set('after', after);

    const response = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?${params.toString()}`,
      { headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' } },
    );

    if (!response.ok) {
      throw new Error(`Failed to list contacts: ${response.statusText}`);
    }

    return response.json();
  }
}
