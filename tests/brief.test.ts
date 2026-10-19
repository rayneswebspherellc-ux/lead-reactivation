import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/read-lead/route";
import { buildBriefRequest, sanitiseBrief, validateBriefRequest, type Brief, type BriefRequest } from "../src/lib/ai/brief";
import { findDeadLeads } from "../src/lib/dormancy";
import { Importer } from "../src/lib/import";
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const call = (body: unknown) =>
    POST(new Request("http://x/api/read-lead", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it("says honestly when no AI key is set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await call(req);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_connected" });
  });

  it("returns a cleaned brief from the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
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
    expect(sent.messages[1].content).toContain("LEAD: Looking for a 2 bed in Dubai Marina");
  });

  it("refuses bad input before calling the model", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ leadName: "x", lines: [] });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
