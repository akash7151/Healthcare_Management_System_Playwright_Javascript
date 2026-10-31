/**
 * Guards for the fictional seed. The local demo password stays available only
 * for a database on this machine. Staging must supply its own password.
 */

const LOCAL_DEMO_PASSWORD = "DemoPass123!";

export function seedPassword(): string {
  const configured = process.env.SEED_PASSWORD?.trim();
  if (configured) {
    if (configured.length < 10 || configured.length > 72) {
      throw new Error("SEED_PASSWORD must be 10 to 72 characters.");
    }
    assertStagingPassword(configured);
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set SEED_PASSWORD when NODE_ENV is production. The local demo password is not used.");
  }
  return LOCAL_DEMO_PASSWORD;
}

export function assertSyntheticSeedAllowed(databaseUrl: string): void {
  const hostname = databaseHostname(databaseUrl);
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const confirmed = process.env.SEED_CONFIRM === "synthetic-staging";
  if (process.env.NODE_ENV === "production" || !local) {
    if (!confirmed) {
      throw new Error(
        "Refusing to seed a non-local database. Set SEED_CONFIRM=synthetic-staging to load fictional records only. This does not copy or reset an existing database.",
      );
    }
  }
}

function assertStagingPassword(password: string): void {
  let hostname = "";
  try {
    hostname = databaseHostname(process.env.DATABASE_URL ?? "");
  } catch {
    hostname = "";
  }
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!local && password === LOCAL_DEMO_PASSWORD) {
    throw new Error("Use a staging password that is not the published local demo password.");
  }
}

function databaseHostname(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
}
