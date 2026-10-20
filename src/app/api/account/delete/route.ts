import { deleteAccount } from "@/lib/server/auth";
import { context, cookie, forbidden, json, notConfigured, sameOrigin, SESSION_COOKIE, unauthorised } from "@/lib/server/http";

/** "Delete everything": removes the signed-in agent's account and every row they own. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const ctx = await context(request);
  if (!ctx) return notConfigured();
  if (!ctx.user) return unauthorised();
  await deleteAccount(ctx.db, ctx.user);
  return json({ ok: true }, 200, { "Set-Cookie": cookie(request, SESSION_COOKIE, "", 0) });
}
