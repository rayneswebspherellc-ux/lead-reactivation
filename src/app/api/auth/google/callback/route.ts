import { decodeIdToken, Google } from "arctic";
import { createSession, SESSION_DAYS, userForGoogle } from "@/lib/server/auth";
import { context, cookie, readCookie, SESSION_COOKIE } from "@/lib/server/http";

/** Google returns here. The state must match the cookie (blocks forged sign-ins). */
export async function GET(request: Request) {
  const ctx = await context(request);
  const url = new URL(request.url);
  const origin = ctx?.env.APP_URL ?? url.origin;
  const fail = (reason: string) => {
    const headers = new Headers({ Location: `${origin}/?signin=${reason}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", cookie(request, "lr_g_state", "", 0));
    headers.append("Set-Cookie", cookie(request, "lr_g_verifier", "", 0));
    return new Response(null, { status: 302, headers });
  };
  if (!ctx || !ctx.env.GOOGLE_CLIENT_ID || !ctx.env.GOOGLE_CLIENT_SECRET) return fail("google_not_connected");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = readCookie(request, "lr_g_state");
  const verifier = readCookie(request, "lr_g_verifier");
  if (!code || !state || !savedState || !verifier || state !== savedState) return fail("google_failed");

  try {
    const google = new Google(ctx.env.GOOGLE_CLIENT_ID, ctx.env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
    const tokens = await google.validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean };
    const user = await userForGoogle(ctx.db, claims);
    if (!user) return fail("google_email_unverified");
    const token = await createSession(ctx.db, user.id);
    const headers = new Headers({ Location: `${origin}/`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86_400));
    headers.append("Set-Cookie", cookie(request, "lr_g_state", "", 0));
    headers.append("Set-Cookie", cookie(request, "lr_g_verifier", "", 0));
    return new Response(null, { status: 302, headers });
  } catch {
    return fail("google_failed");
  }
}
