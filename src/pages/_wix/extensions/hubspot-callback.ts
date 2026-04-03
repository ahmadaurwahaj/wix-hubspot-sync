import type { APIRoute } from "astro";
import { createClient, AppStrategy } from "@wix/sdk";
import { items } from "@wix/data";
import { HubSpotService } from "../../../backend/services/hubspot.service";
import { validateOAuthState } from "../../../backend/utils/oauth-state";
import { getSecret } from "../../../backend/utils/secrets";

/**
 * HubSpot OAuth callback — /_wix/extensions/hubspot-callback
 *
 * This route lives under /_wix/extensions/ so the @wix/astro auth middleware
 * SKIPS it (no generateVisitorTokens call that fails in dev).
 *
 * Because there is no AsyncLocalStorage context here, auth.elevate() cannot
 * work. Instead we create a direct Wix SDK client with AppStrategy to
 * perform CMS writes.
 */

import { COLLECTIONS } from "../../../backend/constants";

const { CONNECTIONS } = COLLECTIONS;

/**
 * Create a Wix SDK client with app-level auth using AppStrategy.
 * Works without AsyncLocalStorage / auth middleware context.
 */
async function getDirectClient() {
  // WIX_CLIENT_INSTANCE_ID and WIX_CLIENT_PUBLIC_KEY are auto-injected by
  // the Wix platform at runtime (import.meta.env). getSecret() falls through
  // to import.meta.env when they're not in Secrets Manager.
  const [appId, appSecret, instanceId, publicKey] = await Promise.all([
    getSecret("APP_WIX_CLIENT_ID"),
    getSecret("APP_WIX_CLIENT_SECRET"),
    getSecret("WIX_CLIENT_INSTANCE_ID"),
    getSecret("WIX_CLIENT_PUBLIC_KEY"),
  ]);

  return createClient({
    auth: AppStrategy({
      appId,
      appSecret,
      instanceId,
      publicKey,
    }),
  });
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[HubSpot OAuth] Error from HubSpot", { error });
      return html(createErrorHTML(`OAuth error: ${error}`), 400);
    }

    if (!code) {
      return html(createErrorHTML("Authorization code missing"), 400);
    }

    if (!state) {
      return html(
        createErrorHTML("State parameter missing — CSRF check failed"),
        400,
      );
    }

    let instanceId: string;
    try {
      instanceId = validateOAuthState(state);
    } catch (err) {
      console.error("[HubSpot OAuth] State validation failed", err);
      return html(createErrorHTML("Invalid or expired OAuth state"), 400);
    }

    let redirectUri: string;
    try {
      redirectUri = await getSecret("HUBSPOT_REDIRECT_URI");
    } catch {
      redirectUri = `${url.protocol}//${url.host}/_wix/extensions/hubspot-callback`;
    }

    let tokens: Awaited<
      ReturnType<typeof HubSpotService.exchangeCodeForTokens>
    >;
    try {
      tokens = await HubSpotService.exchangeCodeForTokens(code, redirectUri);
    } catch (tokenErr: any) {
      console.error(
        "[HubSpot OAuth] Token exchange FAILED:",
        tokenErr?.message ?? tokenErr,
      );
      return html(
        createErrorHTML(
          `Token exchange failed: ${tokenErr?.message ?? tokenErr}`,
        ),
        502,
      );
    }
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    let hubspotAccountId = "unknown";
    try {
      const tokenInfoRes = await fetch(
        "https://api.hubapi.com/oauth/v1/access-tokens/" + tokens.access_token,
      );
      if (tokenInfoRes.ok) {
        const tokenInfo = await tokenInfoRes.json();
        hubspotAccountId = String(
          tokenInfo.hub_id ?? tokenInfo.user_id ?? "unknown",
        );
      }
    } catch {
      /* non-critical */
    }

    try {
      const client = await getDirectClient();
      const dataItems = client.use(items) as any;

      const existing = await dataItems
        .query(CONNECTIONS)
        .eq("siteId", instanceId)
        .find();

      const dataItem: Record<string, any> = {
        siteId: instanceId,
        hubspotAccountId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes: JSON.stringify([
          "crm.objects.contacts.read",
          "crm.objects.contacts.write",
          "crm.schemas.contacts.read",
          "forms",
          "oauth",
        ]),
        status: "connected",
        connectedAt: new Date(),
      };

      if (existing.items.length > 0) {
        dataItem._id = existing.items[0]._id;
      }

      await dataItems.save(CONNECTIONS, dataItem);
    } catch (dbErr: any) {
      console.error(
        "[HubSpot OAuth] DB saveConnection FAILED:",
        dbErr?.message ?? dbErr,
      );
      return html(
        createErrorHTML(`Database save failed: ${dbErr?.message ?? dbErr}`),
        503,
      );
    }

    return html(createSuccessHTML(), 200);
  } catch (err) {
    console.error("[HubSpot OAuth] Callback error", err);
    return html(createErrorHTML("Failed to complete OAuth"), 500);
  }
};

// ---------------------------------------------------------------------------

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function createSuccessHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Connected to HubSpot</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; background:#f6f7f9; }
    .box { text-align:center; padding:2rem; background:#fff;
           border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); }
    .icon { font-size:48px; color:#3899ec; margin-bottom:1rem; }
    h2   { color:#162d3d; margin:0 0 .5rem; }
    p    { color:#7a92a5; margin:0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✓</div>
    <h2>Successfully Connected!</h2>
    <p>You can close this window now.</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage(JSON.parse(JSON.stringify({ type: 'oauth-success' })), '*');
        setTimeout(() => window.close(), 2000);
      }
    } catch (e) {
      console.warn('postMessage to opener failed (cross-origin):', e);
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`;
}

function createErrorHTML(message: string): string {
  const safe = message.replace(
    /[<>"'&]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" })[
        c
      ] ?? c,
  );
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Connection Failed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; background:#f6f7f9; }
    .box { text-align:center; padding:2rem; background:#fff;
           border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,.1); max-width:400px; }
    .icon { font-size:48px; color:#ee5951; margin-bottom:1rem; }
    h2   { color:#162d3d; margin:0 0 .5rem; }
    p    { color:#7a92a5; margin:0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">✕</div>
    <h2>Connection Failed</h2>
    <p>${safe}</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage(JSON.parse(JSON.stringify({ type: 'oauth-error', message: ${JSON.stringify(message)} })), '*');
      }
    } catch (e) {
      console.warn('postMessage to opener failed (cross-origin):', e);
    }
  </script>
</body>
</html>`;
}
