import { createSession, normaliseEmail, SESSION_DAYS, verifyEmailLogin } from "@/lib/server/auth";
import { clientIp, context, cookie, forbidden, json, notConfigured, readJson, sameOrigin, SESSION_COOKIE, tooMany } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const ctx = await context(request);
  if (!ctx) return notConfigured();
  if (tooMany(`verify:${clientIp(request)}`, 30, 10 * 60_000)) return json({ error: "too_many" }, 429);
  let body: { email?: unknown; code?: unknown };
  try {
    body = (await readJson(request)) as typeof body;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const email = normaliseEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  if (!email) return json({ error: "invalid" }, 400);
  const result = await verifyEmailLogin(ctx.db, email, code);
  if ("error" in result) return json({ error: result.error }, 400);
  const token = await createSession(ctx.db, result.user.id);
  return json(
    { user: { email: result.user.email } },
    200,
    { "Set-Cookie": cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86_400) },
  );
}
