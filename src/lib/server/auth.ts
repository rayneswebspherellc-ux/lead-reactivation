import type { Db } from "./store";

/**
 * Accounts, sign-in codes, sessions and AI quotas. All SQL is parameterised.
 * Secrets (session tokens, sign-in codes) are stored only as SHA-256 hashes.
 */

export const SESSION_DAYS = 30;
export const CODE_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export const CODES_PER_EMAIL_PER_HOUR = 5;
/** Far above what a working agent needs; only stops abuse. */
export const AI_PER_HOUR = 300;
export const AI_PER_DAY = 2000;

const HOUR = 3_600_000;

export interface User {
  id: string;
  email: string;
}

const enc = new TextEncoder();

export async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomCode(): string {
  // Uniform 6 digits: reject values that would bias the modulo.
  const max = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]!;
    if (n < max) return String(n % 1_000_000).padStart(6, "0");
  }
}

export function normaliseEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

/* ─── Email codes ─── */

export async function startEmailLogin(
  db: Db,
  email: string,
  now = Date.now(),
): Promise<{ code: string } | { error: "too_many" }> {
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?")
    .bind(email, now - HOUR)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= CODES_PER_EMAIL_PER_HOUR) return { error: "too_many" };
  const code = randomCode();
  await db
    .prepare("INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)")
    .bind(email, await sha256(`${email}:${code}`), now + CODE_MINUTES * 60_000, now)
    .run();
  return { code };
}

export type VerifyResult = { user: User } | { error: "invalid" | "expired" | "locked" };

export async function verifyEmailLogin(db: Db, email: string, code: string, now = Date.now()): Promise<VerifyResult> {
  const row = await db
    .prepare(
      "SELECT rowid AS id, code_hash, expires_at, attempts FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(email)
    .first<{ id: number; code_hash: string; expires_at: number; attempts: number }>();
  if (!row) return { error: "invalid" };
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { error: "locked" };
  if (row.expires_at < now) return { error: "expired" };
  if (!/^\d{6}$/.test(code) || (await sha256(`${email}:${code}`)) !== row.code_hash) {
    await db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE rowid = ?").bind(row.id).run();
    return { error: "invalid" };
  }
  await db.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
  return { user: await userForEmail(db, email, now) };
}

/* ─── Users ─── */

async function userForEmail(db: Db, email: string, now: number): Promise<User> {
  const found = await db.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first<User>();
  if (found) return found;
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, email, now)
    .run();
  return { id, email };
}

/**
 * Google sign-in. Only a Google-verified email may join an existing account
 * with the same address, so nobody can take over an account with an
 * unverified Google email.
 */
export async function userForGoogle(
  db: Db,
  claims: { sub: string; email?: string; email_verified?: boolean },
  now = Date.now(),
): Promise<User | null> {
  const bySub = await db.prepare("SELECT id, email FROM users WHERE google_sub = ?").bind(claims.sub).first<User>();
  if (bySub) return bySub;
  const email = normaliseEmail(claims.email);
  if (!email || claims.email_verified !== true) return null;
  const user = await userForEmail(db, email, now);
  await db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(claims.sub, user.id).run();
  return user;
}

/* ─── Sessions ─── */

export async function createSession(db: Db, userId: string, now = Date.now()): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now + SESSION_DAYS * 24 * HOUR, now)
    .run();
  return token;
}

export async function userForSession(db: Db, token: string | null, now = Date.now()): Promise<User | null> {
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await db
    .prepare(
      "SELECT users.id AS id, users.email AS email, sessions.expires_at AS expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ?",
    )
    .bind(hash)
    .first<User & { expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    return null;
  }
  return { id: row.id, email: row.email };
}

export async function endSession(db: Db, token: string | null): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

/* ─── Delete account ─── */

/** Removes every trace of this agent from every table. Nobody else is touched. */
export async function deleteAccount(db: Db, user: User): Promise<void> {
  const stmts: [string, string][] = [
    ["DELETE FROM saved_leads WHERE owner_id = ?", user.id],
    ["DELETE FROM accounts WHERE id = ?", user.id],
    ["DELETE FROM ai_usage WHERE owner_id = ?", user.id],
    ["DELETE FROM sessions WHERE user_id = ?", user.id],
    ["DELETE FROM login_codes WHERE email = ?", user.email],
    ["DELETE FROM users WHERE id = ?", user.id],
  ];
  for (const [sql, v] of stmts) await db.prepare(sql).bind(v).run();
}

/* ─── AI quota ─── */

export async function consumeAiQuota(db: Db, userId: string, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now / HOUR);
  const day = await db
    .prepare("SELECT COALESCE(SUM(count), 0) AS n FROM ai_usage WHERE owner_id = ? AND bucket > ?")
    .bind(userId, bucket - 24)
    .first<{ n: number }>();
  const hour = await db
    .prepare("SELECT count AS n FROM ai_usage WHERE owner_id = ? AND bucket = ?")
    .bind(userId, bucket)
    .first<{ n: number }>();
  if ((hour?.n ?? 0) >= AI_PER_HOUR || (day?.n ?? 0) >= AI_PER_DAY) return false;
  await db
    .prepare(
      "INSERT INTO ai_usage (owner_id, bucket, count) VALUES (?, ?, 1) ON CONFLICT (owner_id, bucket) DO UPDATE SET count = count + 1",
    )
    .bind(userId, bucket)
    .run();
  return true;
}
