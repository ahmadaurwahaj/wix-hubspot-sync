import { logger } from './logger';

// Cache secrets in memory to avoid repeated lookups within the same request
const secretCache = new Map<string, string>();

export async function getSecret(name: string): Promise<string> {
  const cached = secretCache.get(name);
  if (cached) return cached;

  // Try Wix Secrets Manager (only works in Wix backend runtime context)
  try {
    const { secrets } = await import('@wix/secrets');
    const { auth } = await import('@wix/essentials');
    const elevatedGetSecret = auth.elevate(secrets.getSecretValue);
    const { value } = await elevatedGetSecret({ name });
    if (value) {
      secretCache.set(name, value);
      return value;
    }
  } catch (e) {
    // Not in Wix runtime context — fall through to env vars
  }

  // Fallback to import.meta.env (works in Astro dev server)
  const envValue = (import.meta.env as Record<string, string | undefined>)[name];
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }

  throw new Error(`Secret "${name}" not found (checked Wix Secrets Manager and env vars)`);
}
