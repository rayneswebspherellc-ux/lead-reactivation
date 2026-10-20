import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as deleteAccountRoute } from "../src/app/api/account/delete/route";
import { POST as startRoute } from "../src/app/api/auth/email/start/route";
import { POST as verifyRoute } from "../src/app/api/auth/email/verify/route";
import { GET as meRoute } from "../src/app/api/me/route";
import { POST as readLeadRoute } from "../src/app/api/read-lead/route";
import {
  AI_PER_HOUR,
  CODE_MAX_ATTEMPTS,
  createSession,
  deleteAccount,
  startEmailLogin,
  consumeAiQuota,
  userForGoogle,
  userForSession,
  verifyEmailLogin,
} from "../src/lib/server/auth";
import { setTestEnv } from "../src/lib/server/env";
import { LeadStore } from "../src/lib/server/store";
import { testDb } from "./db";

const SECRET = "test-master-secret-that-is-long-enough-0123456789";

afterEach(() => {
  setTestEnv(null);
  vi.unstubAllGlobals();
});

describe("email sign-in codes", () => {
  it("signs in with the right code once, then the code is gone", async () => {
    const { db } = testDb();
    const s = await startEmailLogin(db, "layla@example.com");
    if ("error" in s) throw new Error();
    const ok = await verifyEmailLogin(db, "layla@example.com", s.code);
    expect("user" in ok && ok.user.email).toBe("layla@example.com");
    expect(await verifyEmailLogin(db, "layla@example.com", s.code)).toEqual({ error: "invalid" });
  });

  it("locks after too many wrong guesses and expires after 10 minutes", async () => {
    const { db } = testDb();
    const s = await startEmailLogin(db, "a@example.com");
    if ("error" in s) throw new Error();
    const wrong = s.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) await verifyEmailLogin(db, "a@example.com", wrong);
    expect(await verifyEmailLogin(db, "a@example.com", s.code)).toEqual({ error: "locked" });

    const t = Date.now();
    const s2 = await startEmailLogin(db, "b@example.com", t);
    if ("error" in s2) throw new Error();
    expect(await verifyEmailLogin(db, "b@example.com", s2.code, t + 11 * 60_000)).toEqual({ error: "expired" });
  });

  it("limits how many codes one address can request", async () => {
    const { db } = testDb();
    for (let i = 0; i < 5; i++) expect("code" in (await startEmailLogin(db, "c@example.com"))).toBe(true);
    expect(await startEmailLogin(db, "c@example.com")).toEqual({ error: "too_many" });
  });

  it("stores only hashes: no code or session token readable in the database", async () => {
    const { db, raw } = testDb();
    const s = await startEmailLogin(db, "d@example.com");
    if ("error" in s) throw new Error();
    const v = await verifyEmailLogin(db, "d@example.com", s.code);
    if (!("user" in v)) throw new Error();
    const token = await createSession(db, v.user.id);
    const dump = JSON.stringify([raw.prepare("SELECT * FROM sessions").all(), raw.prepare("SELECT * FROM login_codes").all()]);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(s.code);
  });
});

describe("Google sign-in", () => {
  it("only a Google-verified email can create or join an account", async () => {
    const { db } = testDb();
    expect(await userForGoogle(db, { sub: "g1", email: "x@example.com", email_verified: false })).toBeNull();
    const u = await userForGoogle(db, { sub: "g1", email: "X@Example.com", email_verified: true });
    expect(u?.email).toBe("x@example.com");
    // Same person later signs in by email code: same account.
    const s = await startEmailLogin(db, "x@example.com");
    if ("error" in s) throw new Error();
    const v = await verifyEmailLogin(db, "x@example.com", s.code);
    expect("user" in v && v.user.id).toBe(u!.id);
  });
});

describe("sessions and delete account", () => {
  it("expired sessions stop working; deleting an account removes only that agent", async () => {
    const { db, raw } = testDb();
    const a = await userForGoogle(db, { sub: "a", email: "a@example.com", email_verified: true });
    const b = await userForGoogle(db, { sub: "b", email: "b@example.com", email_verified: true });
    const now = Date.now();
    const tokA = await createSession(db, a!.id, now);
    const tokB = await createSession(db, b!.id, now);
    expect(await userForSession(db, tokA, now + 31 * 86_400_000)).toBeNull();

    const storeA = await LeadStore.forOwner(db, SECRET, a!.id);
    const storeB = await LeadStore.forOwner(db, SECRET, b!.id);
    await storeA.save({ leadId: "l1", name: "A lead", channels: [], outcome: null, brief: null });
    await storeB.save({ leadId: "l1", name: "B lead", channels: [], outcome: null, brief: null });
    await consumeAiQuota(db, a!.id);

    await deleteAccount(db, a!);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM saved_leads WHERE owner_id = ?").get(a!.id)).toEqual({ n: 0 });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(a!.id)).toEqual({ n: 0 });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE owner_id = ?").get(a!.id)).toEqual({ n: 0 });
    expect(await userForSession(db, tokB)).toEqual({ id: b!.id, email: "b@example.com" });
    expect((await storeB.list()).map((l) => l.name)).toEqual(["B lead"]);
  });

  it("the AI quota is generous and per agent", async () => {
    const { db } = testDb();
    const t = Date.now();
    for (let i = 0; i < AI_PER_HOUR; i++) expect(await consumeAiQuota(db, "agent-a", t)).toBe(true);
    expect(await consumeAiQuota(db, "agent-a", t)).toBe(false);
    expect(await consumeAiQuota(db, "agent-b", t)).toBe(true);
  });
});

describe("routes", () => {
  const req = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://app.test${path}`, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { origin: "http://app.test", "content-type": "application/json", ...headers },
    });

  it("email code sign-in sets a secure session cookie; /api/me then knows the agent", async () => {
    const { db } = testDb();
    let sentCode = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentCode = /code is (\d{6})/.exec(JSON.parse(init.body as string).text)![1]!;
        return new Response("{}", { status: 200 });
      }),
    );
    setTestEnv({ DB: db, RESEND_API_KEY: "re_test" });
    expect((await startRoute(req("/api/auth/email/start", { email: "Agent@Example.com" }))).status).toBe(200);
    const res = await verifyRoute(req("/api/auth/email/verify", { email: "agent@example.com", code: sentCode }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/lr_session=.+; Path=\/; HttpOnly; SameSite=Lax/);
    const token = /lr_session=([^;]+)/.exec(setCookie)![1]!;
    const me = await meRoute(req("/api/me", undefined, { cookie: `lr_session=${token}` }));
    expect(await me.json()).toMatchObject({ user: { email: "agent@example.com" } });
  });

  it("the AI read refuses anyone who is not signed in", async () => {
    const { db } = testDb();
    setTestEnv({ DB: db, OPENAI_API_KEY: "sk-test" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await readLeadRoute(req("/api/read-lead", { leadName: "x", lines: [] }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delete account requires the agent's own session and signs them out", async () => {
    const { db } = testDb();
    setTestEnv({ DB: db });
    const u = await userForGoogle(db, { sub: "z", email: "z@example.com", email_verified: true });
    const token = await createSession(db, u!.id);
    expect((await deleteAccountRoute(req("/api/account/delete", {}))).status).toBe(401);
    const res = await deleteAccountRoute(req("/api/account/delete", {}, { cookie: `lr_session=${token}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await userForSession(db, token)).toBeNull();
  });

  it("refuses sign-in calls from other websites", async () => {
    const { db } = testDb();
    setTestEnv({ DB: db, RESEND_API_KEY: "re_test" });
    const res = await startRoute(req("/api/auth/email/start", { email: "a@example.com" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});
