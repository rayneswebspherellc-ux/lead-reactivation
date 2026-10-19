import {
  BRIEF_SCHEMA,
  SYSTEM_PROMPT,
  sanitiseBrief,
  transcriptForPrompt,
  validateBriefRequest,
  type Brief,
} from "@/lib/ai/brief";

/**
 * Reads one dead lead with AI. The browser sends only that lead's trimmed
 * transcript; nothing is stored or logged here. Needs OPENAI_API_KEY
 * (optional OPENAI_MODEL).
 *
 * Guards: same-origin only (other websites cannot call it with a visitor's
 * browser), body size measured not trusted, input validated before any cost,
 * per-visitor rate limit (best effort; add a Cloudflare rate-limit rule in
 * production because Worker memory is not shared between instances).
 */

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

const MAX_BODY = 200_000;

/** True when the request comes from a page on this same site. */
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

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: "not_connected" }, { status: 503 });
  }
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  if (limited(ip)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return Response.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const req = validateBriefRequest(body);
  if (typeof req === "string") return Response.json({ error: "bad_request", detail: req }, { status: 400 });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      // Ask OpenAI not to keep this exchange for its own product use.
      store: false,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: BRIEF_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcriptForPrompt(req) },
      ],
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return Response.json({ error: "ai_failed", status: res?.status ?? 0 }, { status: 502 });
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return Response.json({ error: "ai_failed" }, { status: 502 });
  let raw: Brief;
  try {
    raw = JSON.parse(content) as Brief;
  } catch {
    return Response.json({ error: "ai_failed" }, { status: 502 });
  }
  return Response.json({ brief: sanitiseBrief(raw, req) });
}
