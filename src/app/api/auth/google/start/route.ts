import { generateCodeVerifier, generateState, Google } from "arctic";
import { cookie } from "@/lib/server/http";
import { getEnv } from "@/lib/server/env";

/** Sends the agent to Google. State and PKCE verifier are kept in short-lived HttpOnly cookies. */
export async function GET(request: Request) {
  const env = await getEnv();
  const origin = env.APP_URL ?? new URL(request.url).origin;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.redirect(`${origin}/?signin=google_not_connected`, 302);
  }
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${origin}/api/auth/google/callback`);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]);
  url.searchParams.set("prompt", "select_account");
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", cookie(request, "lr_g_state", state, 600));
  headers.append("Set-Cookie", cookie(request, "lr_g_verifier", verifier, 600));
  return new Response(null, { status: 302, headers });
}
