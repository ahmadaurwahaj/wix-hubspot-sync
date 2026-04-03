import { webMethod, Permissions } from "@wix/web-methods";
import { TokenManager } from "../utils/token-manager";
import { logger } from "../utils/logger";

export const getHubSpotProperties = webMethod(
  Permissions.Anyone,
  async (context, explicitInstanceId?: string) => {
    try {
      const instanceId =
        typeof context === "string"
          ? context
          : explicitInstanceId || context?.instanceId;

      if (!instanceId) {
        throw new Error("Missing instance context");
      }

      const hubspotService = await TokenManager.getHubSpotService(instanceId);
      const properties = await hubspotService.getContactProperties();

      return {
        properties,
      };
    } catch (error) {
      logger.error("Get HubSpot properties error", error);

      if (
        error instanceof Error &&
        error.message === "HubSpot connection not found"
      ) {
        throw new Error("HubSpot not connected");
      }

      throw new Error("Failed to get properties");
    }
  },
);
