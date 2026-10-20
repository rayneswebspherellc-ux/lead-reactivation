import { endSession } from "@/lib/server/auth";
import { context, cookie, forbidden, json, readCookie, sameOrigin, SESSION_COOKIE } from "@/lib/server/http";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const ctx = await context(request);
  if (ctx) await endSession(ctx.db, readCookie(request, SESSION_COOKIE));
  return json({ ok: true }, 200, { "Set-Cookie": cookie(request, SESSION_COOKIE, "", 0) });
}
