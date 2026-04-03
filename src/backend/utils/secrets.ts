import { logger } from "./logger";

const secretCache = new Map<string, string>();

export async function getSecret(name: string): Promise<string> {
  const cached = secretCache.get(name);
  if (cached) return cached;

  try {
    const { secrets } = await import("@wix/secrets");
    const { auth } = await import("@wix/essentials");
    const elevatedGetSecret = auth.elevate(secrets.getSecretValue);
    const { value } = await elevatedGetSecret({ name });
    if (value) {
      secretCache.set(name, value);
      return value;
    }
  } catch (e) {}

  const envValue = (import.meta.env as Record<string, string | undefined>)[
    name
  ];
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }

  throw new Error(
    `Secret "${name}" not found (checked Wix Secrets Manager and env vars)`,
  );
}
