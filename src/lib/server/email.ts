import type { ServerEnv } from "./env";

/** Sends the sign-in code through Resend. Plain and HTML versions, nothing tracked. */
export async function sendLoginCode(env: ServerEnv, to: string, code: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const from = env.LOGIN_EMAIL_FROM ?? "RaynesWebSphere <website@rayneswebsphere.com>";
  const text = `Your sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;color:#111">
<p>Your sign-in code is</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p>
<p>It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `Your sign-in code: ${code}`, text, html }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
