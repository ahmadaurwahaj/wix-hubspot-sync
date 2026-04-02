/**
 * Shared API helpers for dashboard pages.
 *
 * The Wix dashboard passes an `instance` JWT as a query parameter to each
 * dashboard page iframe. We read this token once and reuse it for:
 *   - Extracting the `instanceId` (site identity)
 *   - Passing it as an Authorization header so that the Astro auth middleware
 *     can set up the Wix SDK context (AsyncLocalStorage) for our API routes
 */

function getInstanceToken(): string {
  try {
    return new URLSearchParams(window.location.search).get('instance') || '';
  } catch {
    return '';
  }
}

export function getInstanceId(): string {
  try {
    const token = getInstanceToken();
    const payload = token.split('.')[1] || '';
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { instanceId: string }).instanceId || '';
  } catch {
    return '';
  }
}

/**
 * Wrapper around `fetch` that:
 *   1. Prepends the base path for API routes
 *   2. Sets the Authorization header with the Wix instance JWT
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getInstanceToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', token);
  }
  return fetch(path, { ...init, headers });
}
