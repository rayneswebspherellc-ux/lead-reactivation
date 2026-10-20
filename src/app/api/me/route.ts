import { context, json, notConfigured, unauthorised } from "@/lib/server/http";

export async function GET(request: Request) {
  const ctx = await context(request);
  if (!ctx) return notConfigured();
  if (!ctx.user) return unauthorised();
  return json({
    user: { email: ctx.user.email },
    google: Boolean(ctx.env.GOOGLE_CLIENT_ID && ctx.env.GOOGLE_CLIENT_SECRET),
  });
}
