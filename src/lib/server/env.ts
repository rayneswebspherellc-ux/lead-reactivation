import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Db } from "./store";

/** Server configuration. Secrets live in Cloudflare (or .env.local for development), never in code. */
export interface ServerEnv {
  DB?: Db;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  DATA_ENCRYPTION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  LOGIN_EMAIL_FROM?: string;
  /** Public address of the app, e.g. https://leads.rayneswebsphere.com (used for the Google return address). */
  APP_URL?: string;
}

let testEnv: ServerEnv | null = null;

/** Tests only: run routes against a test database and fake secrets. */
export function setTestEnv(env: ServerEnv | null): void {
  testEnv = env;
}

export async function getEnv(): Promise<ServerEnv> {
  if (testEnv) return testEnv;
  let cf: Partial<ServerEnv> = {};
  try {
    cf = (await getCloudflareContext({ async: true })).env as Partial<ServerEnv>;
  } catch {
    // Not running on Cloudflare (plain `next start`): environment variables only.
  }
  return { ...(process.env as ServerEnv), ...cf };
}
