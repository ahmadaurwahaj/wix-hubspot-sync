import { submissions } from "@wix/forms";
import { items } from "@wix/data";
import { auth } from "@wix/essentials";
import { COLLECTIONS } from "../../../../backend/constants";
import { logger } from "../../../../backend/utils/logger";

const { CONNECTIONS, SYNC_LOGS } = COLLECTIONS;

/** Write a diagnostic sync-log entry so errors are visible on the dashboard */
async function writeDiagnosticLog(entry: Record<string, any>) {
  try {
    await auth.elevate(items.insert)(SYNC_LOGS, {
      siteId: entry.siteId || "unknown",
      syncCorrelationId: entry.syncCorrelationId || "diag-" + Date.now(),
      source: entry.source || "wix_form",
      action: entry.action || "create",
      status: entry.status || "error",
      error: entry.error || null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      logTimestamp: new Date(),
    });
  } catch (logErr) {
    console.error("[form-submitted] Failed to write diagnostic log:", logErr);
  }
}

export default submissions.onSubmissionCreated(async (event: any) => {
  let siteId = "unknown";
  try {
    const connResult = await auth
      .elevate(items.query)(CONNECTIONS)
      .eq("status", "connected")
      .find();

    if (connResult.items.length === 0) {
      await writeDiagnosticLog({
        status: "error",
        error: "No active HubSpot connection found in CMS",
        source: "wix_form",
        metadata: { step: "getConnection", eventKeys: Object.keys(event) },
      });
      return;
    }

    const conn = connResult.items[0] as Record<string, any>;
    siteId = conn.siteId;
  } catch (dbErr: any) {
    logger.error("[form-submitted] auth.elevate/query FAILED:", dbErr);
    return;
  }

  let submissionFields: Record<string, any> = {};
  let formId = "";
  try {
    const submission =
      event.entity ?? event.createdEvent?.entity ?? event.data?.entity;
    if (!submission) {
      await writeDiagnosticLog({
        siteId,
        status: "error",
        error: `No submission entity found. Event keys: ${Object.keys(event).join(", ")}`,
        source: "wix_form",
        metadata: {
          step: "extractEntity",
          eventShape: JSON.stringify(event).slice(0, 500),
        },
      });
      return;
    }
    formId = submission.formId || "";
    submissionFields = submission.submissions ?? {};
  } catch (extractErr: any) {
    await writeDiagnosticLog({
      siteId,
      status: "error",
      error: `Extract submission failed: ${extractErr?.message}`,
      source: "wix_form",
      metadata: { step: "extractFields" },
    });
    return;
  }

  let accessToken: string;
  try {
    const { TokenManager } =
      await import("../../../../backend/utils/token-manager");
    accessToken = await TokenManager.getValidAccessToken(siteId);
  } catch (tokenErr: any) {
    await writeDiagnosticLog({
      siteId,
      status: "error",
      error: `Token retrieval failed: ${tokenErr?.message}`,
      source: "wix_form",
      metadata: { step: "getToken" },
    });
    return;
  }

  // Step 4: Push to HubSpot
  try {
    const { SyncService } =
      await import("../../../../backend/services/sync.service");
    const formEvent = {
      formSubmission: {
        formId,
        submissions: submissionFields,
      },
      instanceId: siteId,
    };

    await SyncService.submitFormToHubSpot(
      formEvent as any,
      siteId,
      accessToken,
    );
  } catch (syncErr: any) {
    await writeDiagnosticLog({
      siteId,
      status: "error",
      error: `HubSpot sync failed: ${syncErr?.message}`,
      source: "wix_form",
      metadata: { step: "submitToHubSpot", formId },
    });
  }
});
