import { normaliseEmail, startEmailLogin } from "@/lib/server/auth";
import { sendLoginCode } from "@/lib/server/email";
import { clientIp, context, forbidden, json, notConfigured, readJson, sameOrigin, tooMany } from "@/lib/server/http";

/** Emails a 6-digit sign-in code. Always answers the same way, so it never reveals who has an account. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const ctx = await context(request);
  if (!ctx) return notConfigured();
  if (!ctx.env.RESEND_API_KEY) return json({ error: "email_not_connected" }, 503);
  if (tooMany(`code:${clientIp(request)}`, 10, 10 * 60_000)) return json({ error: "too_many" }, 429);
  let email: string | null = null;
  try {
    email = normaliseEmail((await readJson(request) as { email?: unknown })?.email);
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!email) return json({ error: "bad_email" }, 400);
  const started = await startEmailLogin(ctx.db, email);
  if ("error" in started) return json({ error: "too_many" }, 429);
  const sent = await sendLoginCode(ctx.env, email, started.code);
  if (!sent) return json({ error: "send_failed" }, 502);
  return json({ ok: true });
}
