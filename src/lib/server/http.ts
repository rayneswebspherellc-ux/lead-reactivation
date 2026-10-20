import { userForSession, type User } from "./auth";
import { getEnv, type ServerEnv } from "./env";
import type { Db } from "./store";

export const SESSION_COOKIE = "lr_session";

/** True when the request comes from a page on this same site (blocks cross-site form/fetch attacks). */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookie(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Reads a small JSON body, measuring its real size. */
export async function readJson(request: Request, max = 10_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > max) throw new Error("too_large");
  return JSON.parse(text);
}

export interface Ctx {
  env: ServerEnv;
  db: Db;
  user: User | null;
}

/** Environment, database and the signed-in agent (from the session cookie only). */
export async function context(request: Request): Promise<Ctx | null> {
  const env = await getEnv();
  if (!env.DB) return null;
  const user = await userForSession(env.DB, readCookie(request, SESSION_COOKIE));
  return { env, db: env.DB, user };
}

export const notConfigured = () => json({ error: "not_configured" }, 503);
export const unauthorised = () => json({ error: "sign_in_required" }, 401);
export const forbidden = () => json({ error: "forbidden" }, 403);

/** Best-effort per-instance limiter; the Cloudflare rate-limit rule is the real guard. */
const buckets = new Map<string, number[]>();
export function tooMany(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 10_000) buckets.clear();
  return list.length > max;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
}
