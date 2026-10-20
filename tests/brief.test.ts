import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/read-lead/route";
import { buildBriefRequest, sanitiseBrief, validateBriefRequest, type Brief, type BriefRequest } from "../src/lib/ai/brief";
import { findDeadLeads } from "../src/lib/dormancy";
import { Importer } from "../src/lib/import";
import { createSession, userForGoogle } from "../src/lib/server/auth";
import { setTestEnv, type ServerEnv } from "../src/lib/server/env";
import { testDb } from "./db";
import { NOW } from "./helpers";

const req: BriefRequest = {
  leadName: "Sara Khan",
  channels: ["instagram"],
  daysSilent: 60,
  pattern: "lead_waiting",
  lines: [
    { from: "agent", date: "2026-08-01", channel: "instagram", text: "Hi Sara, thanks for reaching out" },
    { from: "lead", date: "2026-08-02", channel: "instagram", text: "Looking for a 2 bed in Dubai Marina, budget AED 1.8M. Can I view it?" },
  ],
};

const modelAnswer: Brief = {
  interest: 140,
  likelihood: 72.6,
  who: "buyer",
  wanted: { area: "Dubai Marina", propertyType: "2 bed", budget: "AED 1.8M", timeline: "  " },
  stage: "asked for a viewing, never got an answer",
  whyCold: "Possibly the viewing request was missed.",
  summary: "Buyer for a 2 bed in Dubai Marina at AED 1.8M who asked to view.",
  evidence: [
    { point: "Gave a budget", quote: "budget AED 1.8M" },
    { point: "Invented", quote: "I am a cash buyer ready to sign today" },
  ],
  thinkAbout: ["Is there still a 2 bed in the Marina near AED 1.8M?", "Could she view this week?", "Extra", "Too many"],
  opener: "Hi Sara, you asked about a 2 bed in Dubai Marina. Are you still looking?",
  language: "English",
  doNotContact: false,
};

describe("AI brief rules", () => {
  it("clamps scores, empties blank fields, drops quotes the lead never wrote, caps lists", () => {
    const b = sanitiseBrief(modelAnswer, req);
    expect(b.interest).toBe(100);
    expect(b.likelihood).toBe(73);
    expect(b.wanted.timeline).toBeNull();
    expect(b.evidence).toEqual([{ point: "Gave a budget", quote: "budget AED 1.8M" }]);
    expect(b.thinkAbout).toHaveLength(3);
  });

  it("rejects requests that are empty, too long or malformed", () => {
    expect(validateBriefRequest(null)).toBeTypeOf("string");
    expect(validateBriefRequest({ ...req, lines: [] })).toBeTypeOf("string");
    expect(validateBriefRequest({ ...req, lines: [{ from: "x", text: "hi" }] })).toBeTypeOf("string");
    expect(validateBriefRequest({ ...req, lines: Array(81).fill(req.lines[0]) })).toBeTypeOf("string");
    expect(validateBriefRequest(req)).toMatchObject({ leadName: "Sara Khan" });
  });

  it("sends only 1:1 text messages from the lead's own chats, newest within budget", async () => {
    const imp = new Importer();
    await imp.addFile(
      "WhatsApp Chat with Sara.txt",
      new TextEncoder().encode(
        "01/06/2026, 10:00 - Sara: Hi, villa in Arabian Ranches?\n" +
          "01/06/2026, 10:01 - Sara: <Media omitted>\n" +
          "01/06/2026, 10:30 - Layla: Hello Sara\n",
      ),
    );
    const res = imp.finish();
    const [v] = findDeadLeads(res.leads, { now: NOW });
    const r = buildBriefRequest(res.leads[0]!, v!);
    expect(r.lines.map((l) => l.from)).toEqual(["lead", "agent"]);
    expect(r.lines[0]!.text).toBe("Hi, villa in Arabian Ranches?");
  });
});

describe("POST /api/read-lead", () => {
  let cookie = "";
  const signedIn = async (env: Partial<ServerEnv> = {}) => {
    const { db } = testDb();
    const u = await userForGoogle(db, { sub: "s", email: "agent@example.com", email_verified: true });
    cookie = `lr_session=${await createSession(db, u!.id)}`;
    setTestEnv({ DB: db, ...env });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    setTestEnv(null);
  });

  const call = (body: unknown, headers: Record<string, string> = { origin: "http://x" }) =>
    POST(
      new Request("http://x/api/read-lead", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: { "content-type": "application/json", cookie, ...headers },
      }),
    );

  it("refuses calls from other websites", async () => {
    await signedIn({ OPENAI_API_KEY: "test-key" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call(req, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(req, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call(req, {})).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses oversized bodies even when the size header lies", async () => {
    await signedIn({ OPENAI_API_KEY: "test-key" });
    const res = await call("x".repeat(250_000));
    expect(res.status).toBe(413);
  });

  it("says honestly when no AI key is set", async () => {
    await signedIn();
    const res = await call(req);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_connected" });
  });

  it("returns a cleaned brief from the model", async () => {
    await signedIn({ OPENAI_API_KEY: "test-key" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelAnswer) } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(req);
    expect(res.status).toBe(200);
    const { brief } = (await res.json()) as { brief: Brief };
    expect(brief.evidence).toHaveLength(1);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.store).toBe(false);
    expect(sent.messages[1].content).toContain("LEAD: Looking for a 2 bed in Dubai Marina");
  });

  it("refuses bad input before calling the model", async () => {
    await signedIn({ OPENAI_API_KEY: "test-key" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ leadName: "x", lines: [] });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("brand colours", () => {
  it("the app uses exactly the website's colour tokens, and no other colour codes", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tokens = (css: string) =>
      Object.fromEntries([...css.matchAll(/--(rws-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]!.toLowerCase()]));
    const app = tokens(readFileSync("src/app/globals.css", "utf8"));
    expect(app).toEqual({
      "rws-bg": "#000000",
      "rws-box-border": "#1f1f1f",
      "rws-box-fill": "#333333",
      "rws-gold": "#cebd63",
      "rws-gold-hover": "#d9cb7a",
      "rws-text-primary": "#f9f7ec",
      "rws-text-secondary": "#fbfaf3",
      "rws-text-tertiary": "#fdfefb",
      "rws-white": "#ffffff",
    });
    const allowed = new Set(Object.values(app));
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
    walk("src");
    const offenders: string[] = [];
    for (const f of files.filter((f) => /\.(tsx?|css|svg)$/.test(f))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!allowed.has(m[0].toLowerCase())) offenders.push(`${f}: ${m[0]}`);
      }
      if (/\brgba?\(|\bhsla?\(/.test(text)) offenders.push(`${f}: rgb/hsl colour`);
    }
    expect(offenders).toEqual([]);
  });
});
