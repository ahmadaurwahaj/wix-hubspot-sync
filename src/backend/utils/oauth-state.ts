/**
 * Shared OAuth state storage and helpers.
 *
 * Both the /api/oauth/initiate route and the hubspot-callback route
 * must use the SAME in-memory map so the state written during initiation
 * can be validated during the callback.
 *
 * This module is intentionally free of @wix/web-methods so it can be
 * imported from SSR / Astro API routes without triggering broken ESM
 * resolution in that package.
 */


export const oauthStates = new Map<
  string,
  { instanceId: string; timestamp: number }
>();


setInterval(() => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > tenMinutes) {
      oauthStates.delete(state);
    }
  }
}, 60_000);


export function generateRandomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validates and consumes an OAuth state parameter.
 * @returns the instanceId that was stored during initiation
 * @throws if the state is unknown, expired, or already consumed
 */
export function validateOAuthState(state: string): string {
  const stateData = oauthStates.get(state);

  if (!stateData) {
    throw new Error('Invalid or expired OAuth state');
  }

  const tenMinutes = 10 * 60 * 1000;
  if (Date.now() - stateData.timestamp > tenMinutes) {
    oauthStates.delete(state);
    throw new Error('OAuth state expired');
  }


  oauthStates.delete(state);
  return stateData.instanceId;
}
