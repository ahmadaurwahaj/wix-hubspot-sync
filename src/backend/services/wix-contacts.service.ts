import { logger } from "../utils/logger";
import { getSecret } from "../utils/secrets";

const WIX_API_BASE = "https://www.wixapis.com";

interface WixContactInfo {
  name?: { first?: string; last?: string };
  emails?: { items: Array<{ email: string; primary?: boolean }> };
  phones?: { items: Array<{ phone: string; primary?: boolean }> };
  company?: string;
  jobTitle?: string;
  addresses?: {
    items: Array<{ city?: string; country?: string; addressLine1?: string }>;
  };
}

interface WixContactResponse {
  contact: {
    id: string;
    revision: number;
    info: WixContactInfo;
    createdDate: string;
    updatedDate: string;
  };
}

interface WixContactListResponse {
  contacts: Array<WixContactResponse["contact"]>;
  pagingMetadata: {
    count: number;
    offset: number;
    total: number;
    hasNext: boolean;
  };
}

export class WixContactsService {
  private siteAccessToken: string;

  constructor(siteAccessToken: string) {
    this.siteAccessToken = siteAccessToken;
  }

  static async getAppAccessToken(instanceId: string): Promise<string> {
    const clientId = await getSecret("APP_WIX_CLIENT_ID");
    const clientSecret = await getSecret("APP_WIX_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error(
        "APP_WIX_CLIENT_ID or APP_WIX_CLIENT_SECRET not configured",
      );
    }

    const response = await fetch("https://www.wixapis.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        grantType: "client_credentials",
        instanceId,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Failed to get Wix access token", {
        status: response.status,
      });
      throw new Error(`Wix token exchange failed: ${body}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  async createContact(
    info: WixContactInfo,
  ): Promise<WixContactResponse["contact"]> {
    logger.info("Creating Wix contact", {
      email: info.emails?.items?.[0]?.email,
    });

    const response = await fetch(`${WIX_API_BASE}/contacts/v4/contacts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ info }),
    });

    if (!response.ok) {
      const errText = await response.text();

      try {
        const errData = JSON.parse(errText);
        const duplicateId =
          errData?.details?.applicationError?.data?.duplicateContactId;
        if (duplicateId) {
          logger.info("Duplicate contact found, updating instead", {
            duplicateId,
          });
          const existing = await this.getContact(duplicateId);
          return this.updateContact(duplicateId, existing.revision, info);
        }
      } catch {
        /* not JSON or no duplicate info — fall through */
      }

      logger.error("Failed to create Wix contact", {
        status: response.status,
        errText,
      });
      throw new Error(`Create Wix contact failed: ${errText}`);
    }

    const data: WixContactResponse = await response.json();
    logger.info("Wix contact created", { id: data.contact.id });
    return data.contact;
  }

  async updateContact(
    contactId: string,
    revision: number,
    info: Partial<WixContactInfo>,
  ): Promise<WixContactResponse["contact"]> {
    logger.info("Updating Wix contact", { contactId });

    const response = await fetch(
      `${WIX_API_BASE}/contacts/v4/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ info, revision }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      logger.error("Failed to update Wix contact", {
        contactId,
        status: response.status,
      });
      throw new Error(`Update Wix contact failed: ${err}`);
    }

    const data: WixContactResponse = await response.json();
    return data.contact;
  }

  async getContact(contactId: string): Promise<WixContactResponse["contact"]> {
    const response = await fetch(
      `${WIX_API_BASE}/contacts/v4/contacts/${contactId}`,
      {
        headers: this.headers(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get Wix contact: ${response.statusText}`);
    }

    const data: WixContactResponse = await response.json();
    return data.contact;
  }

  async queryContactByEmail(
    email: string,
  ): Promise<WixContactResponse["contact"] | null> {
    const response = await fetch(`${WIX_API_BASE}/contacts/v4/contacts/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: {
          filter: JSON.stringify({
            "info.emails.email": { $eq: email },
          }),
          paging: { limit: 1 },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to query Wix contacts: ${response.statusText}`);
    }

    const data: WixContactListResponse = await response.json();
    return data.contacts?.[0] ?? null;
  }

  async listContacts(offset = 0, limit = 100): Promise<WixContactListResponse> {
    const response = await fetch(`${WIX_API_BASE}/contacts/v4/contacts/query`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query: { paging: { offset, limit } },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to list Wix contacts: ${response.statusText}`);
    }

    return response.json();
  }

  static toWixContactInfo(fields: Record<string, string>): WixContactInfo {
    const info: WixContactInfo = {};

    if (fields.firstName || fields.lastName) {
      info.name = {};
      if (fields.firstName) info.name.first = fields.firstName;
      if (fields.lastName) info.name.last = fields.lastName;
    }

    if (fields.emailAddress) {
      info.emails = { items: [{ email: fields.emailAddress, primary: true }] };
    }

    if (fields.phone) {
      info.phones = { items: [{ phone: fields.phone, primary: true }] };
    }

    if (fields.company) info.company = fields.company;
    if (fields.jobTitle) info.jobTitle = fields.jobTitle;

    if (fields.address || fields.city || fields.country) {
      info.addresses = {
        items: [
          {
            addressLine1: fields.address,
            city: fields.city,
            country: fields.country,
          },
        ],
      };
    }

    return info;
  }

  static fromWixContact(
    contact: WixContactResponse["contact"],
  ): Record<string, string> {
    const fields: Record<string, string> = {};
    const info = contact.info;

    fields._id = contact.id;
    if (contact.updatedDate) fields.updatedDate = contact.updatedDate;
    if (contact.createdDate) fields.createdDate = contact.createdDate;
    if (info.name?.first) fields.firstName = info.name.first;
    if (info.name?.last) fields.lastName = info.name.last;
    if (info.emails?.items?.[0]?.email)
      fields.emailAddress = info.emails.items[0].email;
    if (info.phones?.items?.[0]?.phone)
      fields.phone = info.phones.items[0].phone;
    if (info.company) fields.company = info.company;
    if (info.jobTitle) fields.jobTitle = info.jobTitle;
    if (info.addresses?.items?.[0]) {
      const addr = info.addresses.items[0];
      if (addr.addressLine1) fields.address = addr.addressLine1;
      if (addr.city) fields.city = addr.city;
      if (addr.country) fields.country = addr.country;
    }

    return fields;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.siteAccessToken,
      "Content-Type": "application/json",
    };
  }
}
