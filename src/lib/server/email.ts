import type { ServerEnv } from "./env";

/**
 * Brand colours written out, because email apps cannot read the site's CSS
 * variables. Same values as the --rws-* tokens in globals.css.
 */
const RWS = { bg: "#000000", boxBorder: "#1f1f1f", gold: "#CEBD63", text: "#f9f7ec" } as const;

/** Sends the sign-in code through Resend. Plain and HTML versions, nothing tracked. */
export async function sendLoginCode(env: ServerEnv, to: string, code: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const from = env.LOGIN_EMAIL_FROM ?? "RaynesWebSphere <website@rayneswebsphere.com>";
  const text = `Your sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`;
  const html = `<div style="background:${RWS.bg};padding:32px 24px;font-family:'DM Sans',Arial,sans-serif;font-size:16px;line-height:1.6;color:${RWS.text}">
<div style="max-width:480px;margin:0 auto;border:1px solid ${RWS.boxBorder};border-radius:24px;padding:28px">
<p style="margin:0 0 4px;font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${RWS.gold}">Lead Reactivation</p>
<p style="margin:16px 0 8px">Your sign-in code is</p>
<p style="margin:0 0 16px;font-family:'IBM Plex Mono',monospace;font-size:28px;letter-spacing:6px;font-weight:600;color:${RWS.gold}">${code}</p>
<p style="margin:0">It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
</div>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `Your sign-in code: ${code}`, text, html }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
