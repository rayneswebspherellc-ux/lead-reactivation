import {
  BRIEF_SCHEMA,
  SYSTEM_PROMPT,
  sanitiseBrief,
  transcriptForPrompt,
  validateBriefRequest,
  type Brief,
} from "@/lib/ai/brief";
import { consumeAiQuota } from "@/lib/server/auth";
import { context, forbidden, json, notConfigured, sameOrigin, unauthorised } from "@/lib/server/http";

export { sameOrigin };

/**
 * Reads one dead lead with AI, for a signed-in agent only. The browser sends
 * only that lead's trimmed transcript; nothing is stored or logged here.
 *
 * Guards: same-origin only, sign-in required (strangers cannot spend AI
 * credit), per-agent quota far above real use (300 an hour, 2,000 a day),
 * body size measured not trusted, input validated before any cost.
 */

const MAX_BODY = 200_000;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const ctx = await context(request);
  if (!ctx) return notConfigured();
  if (!ctx.user) return unauthorised();
  const key = ctx.env.OPENAI_API_KEY;
  if (!key) return json({ error: "not_connected" }, 503);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: "too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const req = validateBriefRequest(body);
  if (typeof req === "string") return json({ error: "bad_request", detail: req }, 400);
  if (!(await consumeAiQuota(ctx.db, ctx.user.id))) return json({ error: "rate_limited" }, 429);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ctx.env.OPENAI_MODEL ?? "gpt-4o-mini",
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

  if (!res || !res.ok) return json({ error: "ai_failed", status: res?.status ?? 0 }, 502);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return json({ error: "ai_failed" }, 502);
  let raw: Brief;
  try {
    raw = JSON.parse(content) as Brief;
  } catch {
    return json({ error: "ai_failed" }, 502);
  }
  return json({ brief: sanitiseBrief(raw, req) });
}
