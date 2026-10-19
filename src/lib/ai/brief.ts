import type { Channel, Lead } from "../types";
import type { Verdict } from "../dormancy";

/**
 * The AI read of one dead lead. Built only from that lead's own conversation:
 * the app does not know the agent's business, listings or offers, so the AI
 * never suggests an offer. It explains, quotes, and gives the agent questions
 * to think about.
 */

export const MAX_LINES = 80;
export const MAX_LINE_CHARS = 1200;
export const MAX_TOTAL_CHARS = 40_000;

export interface TranscriptLine {
  /** "lead" or "agent" */
  from: "lead" | "agent";
  /** ISO date, day precision */
  date: string;
  channel: Channel;
  text: string;
}

export interface BriefRequest {
  leadName: string;
  channels: Channel[];
  daysSilent: number;
  pattern: "lead_waiting" | "went_quiet";
  lines: TranscriptLine[];
}

export interface Brief {
  /** How keen they sounded, 0 to 100 */
  interest: number;
  /** How close they were to acting, 0 to 100 */
  likelihood: number;
  who: "buyer" | "seller" | "renter" | "landlord" | "investor" | "unclear";
  /** Only what the lead said. null when they did not say it. */
  wanted: {
    area: string | null;
    propertyType: string | null;
    budget: string | null;
    timeline: string | null;
  };
  /** e.g. "asked for the price, then went quiet" */
  stage: string;
  /** Best reading of why it went cold; always phrased as a guess. */
  whyCold: string;
  /** Two sentences at most. */
  summary: string;
  /** Points backed by the lead's exact words. */
  evidence: { point: string; quote: string }[];
  /** 2 or 3 questions for the agent, built on the lead's words. Never an offer. */
  thinkAbout: string[];
  /** Short, editable opener that only refers back to the last conversation. No offer. */
  opener: string;
  /** Language the lead wrote in, e.g. "English", "Arabic". */
  language: string;
  /** True if the lead asked not to be contacted or is clearly done. */
  doNotContact: boolean;
}

/** Turn a lead into the smallest transcript the AI needs: 1:1 chats only, trimmed. */
export function buildBriefRequest(lead: Lead, verdict: Verdict): BriefRequest {
  const lines: TranscriptLine[] = lead.conversations
    .filter((c) => !c.isGroup && c.selfKnown)
    .flatMap((c) =>
      c.excerpt
        .filter((m) => m.kind === "text" && m.from !== "system" && m.text.trim())
        .map((m) => ({
          from: m.from as "lead" | "agent",
          date: new Date(m.at).toISOString().slice(0, 10),
          channel: c.channel,
          text: m.text.length > MAX_LINE_CHARS ? m.text.slice(0, MAX_LINE_CHARS) + "…" : m.text,
          at: m.at,
        })),
    )
    .sort((a, b) => a.at - b.at)
    .map((l) => ({ from: l.from, date: l.date, channel: l.channel, text: l.text }));

  // Keep the most recent lines within the size budget.
  let total = 0;
  const kept: TranscriptLine[] = [];
  for (let i = lines.length - 1; i >= 0 && kept.length < MAX_LINES; i--) {
    total += lines[i]!.text.length;
    if (total > MAX_TOTAL_CHARS) break;
    kept.unshift(lines[i]!);
  }
  return {
    leadName: lead.name,
    channels: lead.channels,
    daysSilent: verdict.daysSilent,
    pattern: verdict.pattern ?? "went_quiet",
    lines: kept,
  };
}

/** Check a request from the browser before it costs anything. */
export function validateBriefRequest(body: unknown): BriefRequest | string {
  if (!body || typeof body !== "object") return "Missing body.";
  const b = body as Partial<BriefRequest>;
  if (typeof b.leadName !== "string" || b.leadName.length > 200) return "Bad lead name.";
  if (!Array.isArray(b.lines) || b.lines.length === 0) return "No conversation to read.";
  if (b.lines.length > MAX_LINES) return "Too many lines.";
  let total = 0;
  for (const l of b.lines) {
    if (!l || (l.from !== "lead" && l.from !== "agent") || typeof l.text !== "string") return "Bad line.";
    if (l.text.length > MAX_LINE_CHARS + 1) return "Line too long.";
    total += l.text.length;
  }
  if (total > MAX_TOTAL_CHARS) return "Conversation too long.";
  if (typeof b.daysSilent !== "number") return "Bad daysSilent.";
  return {
    leadName: b.leadName,
    channels: Array.isArray(b.channels) ? b.channels.slice(0, 7) : [],
    daysSilent: b.daysSilent,
    pattern: b.pattern === "lead_waiting" ? "lead_waiting" : "went_quiet",
    lines: b.lines.map((l) => ({
      from: l.from,
      date: String(l.date).slice(0, 10),
      channel: l.channel,
      text: l.text,
    })),
  };
}

export const SYSTEM_PROMPT = `You help a real estate agent decide which old leads to contact again.
You read ONE past conversation between the agent and a lead. The agent may work in Dubai, Bahrain, the U.S., Canada or anywhere else.

Hard rules:
1. You know ONLY this conversation. You do not know the agent's listings, prices, developers, launches, market data or business. Never invent any of it.
2. Never suggest an offer, a property, a price or a deal. The agent decides what to offer.
3. Every fact you state about the lead must come from the lead's own words. For each evidence item, "quote" must be copied exactly from one of the lead's lines (a short exact excerpt, max 160 characters).
4. "wanted" fields: fill only with what the lead actually said; otherwise null.
5. "whyCold" is a guess: start it with "Possibly" or "It looks like".
6. "thinkAbout": 2 or 3 short questions for the agent, built on what the lead said, that help the agent decide what to bring back to them. Questions, not instructions, not offers.
7. "opener": a short, friendly first message (max 300 characters) in the lead's language, that refers back to what they were looking for or asked. No offer, no price, no property, no fake urgency, no emojis unless the lead used them. Use the lead's first name if known.
8. If the lead asked not to be contacted, said they bought elsewhere, or was rude/abusive, set doNotContact true.
9. Scores: interest = how keen they sounded; likelihood = how close they were to acting (viewing asked, budget given, timeline given raise it; one vague question keeps it low).
10. Write in clear, simple English (except the opener, which is in the lead's language).`;

/** JSON Schema for OpenAI structured outputs (strict). */
export const BRIEF_SCHEMA = {
  name: "lead_brief",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "interest",
      "likelihood",
      "who",
      "wanted",
      "stage",
      "whyCold",
      "summary",
      "evidence",
      "thinkAbout",
      "opener",
      "language",
      "doNotContact",
    ],
    properties: {
      interest: { type: "integer" },
      likelihood: { type: "integer" },
      who: { type: "string", enum: ["buyer", "seller", "renter", "landlord", "investor", "unclear"] },
      wanted: {
        type: "object",
        additionalProperties: false,
        required: ["area", "propertyType", "budget", "timeline"],
        properties: {
          area: { type: ["string", "null"] },
          propertyType: { type: ["string", "null"] },
          budget: { type: ["string", "null"] },
          timeline: { type: ["string", "null"] },
        },
      },
      stage: { type: "string" },
      whyCold: { type: "string" },
      summary: { type: "string" },
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["point", "quote"],
          properties: { point: { type: "string" }, quote: { type: "string" } },
        },
      },
      thinkAbout: { type: "array", items: { type: "string" } },
      opener: { type: "string" },
      language: { type: "string" },
      doNotContact: { type: "boolean" },
    },
  },
} as const;

export function transcriptForPrompt(req: BriefRequest): string {
  const head = `Lead: ${req.leadName}\nPlatforms: ${req.channels.join(", ") || "unknown"}\nDays since last message: ${req.daysSilent}\nWho wrote last: ${req.pattern === "lead_waiting" ? "the lead (never answered)" : "the agent (lead went quiet)"}\n\nConversation (oldest first):`;
  const body = req.lines
    .map((l) => `[${l.date}] ${l.from === "lead" ? "LEAD" : "AGENT"}: ${l.text.replace(/\n/g, " / ")}`)
    .join("\n");
  return `${head}\n${body}`;
}

const squash = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Enforce the rules on the model's answer: clamp scores, drop evidence whose
 * quote is not really in the lead's words, cap list lengths.
 */
export function sanitiseBrief(raw: Brief, req: BriefRequest): Brief {
  const leadText = squash(req.lines.filter((l) => l.from === "lead").map((l) => l.text).join(" \n "));
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const nullIfEmpty = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return {
    interest: clamp(raw.interest),
    likelihood: clamp(raw.likelihood),
    who: raw.who,
    wanted: {
      area: nullIfEmpty(raw.wanted.area),
      propertyType: nullIfEmpty(raw.wanted.propertyType),
      budget: nullIfEmpty(raw.wanted.budget),
      timeline: nullIfEmpty(raw.wanted.timeline),
    },
    stage: raw.stage.trim().slice(0, 140),
    whyCold: raw.whyCold.trim().slice(0, 300),
    summary: raw.summary.trim().slice(0, 400),
    evidence: raw.evidence
      .filter((e) => e.quote && leadText.includes(squash(e.quote).replace(/…$/, "")))
      .slice(0, 5),
    thinkAbout: raw.thinkAbout.map((q) => q.trim()).filter(Boolean).slice(0, 3),
    opener: raw.opener.trim().slice(0, 400),
    language: raw.language.trim().slice(0, 40),
    doNotContact: Boolean(raw.doNotContact),
  };
}
