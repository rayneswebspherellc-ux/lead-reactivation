# Going live: steps for the founder

You type every secret yourself, straight into Cloudflare. Nobody else (including the AI) ever needs to see them. Each step says where to click or what to type in a terminal inside the `lead-reactivation` folder.

## 1. Create the database (once)
```
npx wrangler login
npx wrangler d1 create lead-reactivation
```
Copy the `database_id` it prints into `wrangler.jsonc` (replacing the zeros), then create the tables:
```
npm run db:migrate:remote
```

## 2. Add the secrets (each command asks you to paste the value; it is never shown or saved in the code)
| Secret | Where to get it | Command |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys. A separate key for this app is best, with a monthly spending limit. | `npx wrangler secret put OPENAI_API_KEY` |
| `DATA_ENCRYPTION_SECRET` | Make one: run `openssl rand -base64 48` and paste the result. Keep a private copy; never change it once agents have saved data. | `npx wrangler secret put DATA_ENCRYPTION_SECRET` |
| `RESEND_API_KEY` | resend.com → API Keys (the domain rayneswebsphere.com is already verified). Sends the sign-in codes. | `npx wrangler secret put RESEND_API_KEY` |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | See step 3. | `npx wrangler secret put GOOGLE_CLIENT_ID`, then `npx wrangler secret put GOOGLE_CLIENT_SECRET` |

## 3. Google sign-in (about 10 minutes)
1. Go to console.cloud.google.com → create a project called "Lead Reactivation".
2. Google Auth Platform (OAuth consent screen): app name "Lead Reactivation by RaynesWebSphere", your support email, and the privacy policy link `https://<app address>/privacy`. Audience: External.
3. Clients → Create client → Web application.
   - Authorised JavaScript origin: `https://<app address>`
   - Authorised redirect URI: `https://<app address>/api/auth/google/callback`
4. Copy the Client ID and Client secret into the two secrets above.
5. Publish the app (from "Testing" to "In production") so any agent can sign in.

## 4. Deploy
```
npm run deploy
```
Then set the public address, so Google sends people back to the right place: add `"APP_URL": "https://<app address>"` under `vars` in `wrangler.jsonc` and deploy again.

## 5. Abuse protection (Cloudflare dashboard, once there is a custom domain)
Security → WAF → Rate limiting rules → Create:
- **Sign-in:** URI path starts with `/api/auth/`. Limit: **20 requests per minute per IP**, then block for 10 minutes.
- **AI read:** URI path equals `/api/read-lead`. Limit: **60 requests per minute per IP**, then block for 10 minutes.

A real agent never comes close. Pressing "Let AI read the top 20" sends 20 requests over about half a minute. The app also limits each signed-in agent to 300 AI reads an hour and 2,000 a day, far above real use, so nobody can burn the OpenAI credit. Only signed-in agents can use the AI read at all.

## 6. Before inviting agents
- Test sign-in with Google and with an email code on a real phone.
- Press "Delete everything" on a test account and check that it can no longer sign in to the old data.
- Run an independent security test (see `docs/security.md`).
