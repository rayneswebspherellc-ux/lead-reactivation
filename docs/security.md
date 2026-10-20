# Security and privacy (19 Oct 2026)

Honest status: what protects agents' data today, what is built for when
accounts arrive, and what must still happen before a public launch. No system
can be promised "unhackable"; the goal is that a breach of any one part leaks
nothing useful, and that agents stay in control of their data.

## The core design: we hold as little as possible
- **Chat exports never leave the agent's device.** They are read in a background worker inside the browser. There is no upload endpoint. The server never sees, stores or logs raw chats.
- **The AI read is opt-in, one person at a time.** It sends only the last part of that one 1:1 conversation (at most 80 lines and 40,000 characters). Nothing is stored and nothing is logged. The OpenAI request sets `store: false`.
- **No tracking or analytics scripts.** Nothing third-party runs on the page.
- **Delete everything.** One button, available on every screen, with a confirmation. It stops the reader (dropping every chat held in memory) and wipes everything the app saved in that browser. Tested.

## Protections in the app today (tested)
| Risk | Protection | Test |
|---|---|---|
| Injected script stealing chats | Content Security Policy with a fresh nonce per page: only our own scripts run, and the page may only talk to its own server (`connect-src 'self'`) | `curl -I` shows the header; app runs with no CSP errors |
| Being framed by a fake site (clickjacking) | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | header check |
| Another website calling our AI endpoint through a visitor's browser | Same-origin check (Origin and Sec-Fetch-Site); cross-site calls get 403 | `tests/brief.test.ts`, live `curl` gives 403 |
| Abuse and cost attacks on the AI endpoint | Body size measured (not trusted from the header), strict input validation before any AI cost, per-visitor rate limit | `tests/brief.test.ts` |
| AI inventing facts, or being tricked by text inside a chat | Strict output schema. Every quote is checked against the lead's real words and dropped if not found. Output is shown as plain text, never as HTML | `tests/brief.test.ts` |
| Malicious ZIP files (zip bombs, broken ZIPs) | Media never unpacked, 512 MB cap per file, nesting limit; ZIP library updated to 0.8.3 (fixes an infinite-loop bug in broken ZIP64 files) | `npm audit`: 0 vulnerabilities |
| Leaking pages to other sites | `Referrer-Policy: no-referrer`, HSTS, `nosniff`, camera/mic/location disabled | header check |
| Secrets in the code | API keys only as server environment secrets; `.env*` and `*.zip` are git-ignored | `.gitignore` |

## Built for accounts: agent A can never see agent B (tested, not yet switched on)
`src/lib/server/store.ts` is the **only** way server code may touch saved data:
1. **A store is opened for one agent**, whose id comes from the verified login session, never from the request.
2. **No method accepts an agent id.** Every query is bound to the store's own agent, and the database key is (agent, lead). The same lead id under two agents is two separate rows, so one agent can never overwrite another's.
3. **Encryption per agent.** Names, outcomes and AI reads are encrypted with a key derived from a server secret plus that agent's id (HKDF, then AES-256-GCM). The agent id is also bound into each record. A record that somehow lands in another agent's account cannot be decrypted, and the database alone reveals nothing readable.
4. **Raw chats are never stored**, even with accounts.
5. **`deleteEverything()`** removes every record of that agent and the account itself, and touches no one else.

Tests (`tests/isolation.test.ts`, 7 tests) prove each point on a real SQLite database with the real schema (`migrations/0001_init.sql`):
- separate lists for each agent, even with the same lead id
- no cross-overwrite
- nothing readable in the database
- a moved row fails to decrypt
- delete removes one agent only
- injection-style ids are refused
- keys differ per agent

## Sign-in (built 20 Oct 2026, founder chose Google + email)
- **Google:** OAuth with state and PKCE (via `arctic`). Only a Google-verified email can create an account or join an existing one, so an unverified Google email can never take over an account.
- **Email:** a 6-digit code, no passwords at all. Codes are stored only as SHA-256 hashes, expire after 10 minutes, lock after 5 wrong tries, at most 5 codes per address per hour. The answer never reveals whether an address has an account.
- **Sessions:** a random 256-bit token in an HttpOnly, SameSite=Lax (Secure on HTTPS) cookie. Only its SHA-256 hash is stored, so a database leak gives no working logins. Sessions end after 30 days or on sign-out.
- **Every state-changing endpoint is same-origin only.**
- **The AI read requires sign-in, with a per-agent quota** (300 an hour, 2,000 a day) stored in the database.
- **Delete everything, when signed in,** calls `/api/account/delete`, which removes the agent's rows from every table (saved leads, account, AI usage, sessions, codes, user) and signs them out. The app says "deleted" only after the server confirms.
- **Tests:** `tests/auth.test.ts` (11) covers codes, lockout, expiry, hashing, the Google verified-email rule, session expiry, account deletion that touches no one else, the quota, cookie flags, refusing the AI read to strangers, and cross-site refusal. A browser walk-through also passed: the sign-in screens, the signed-in app, and delete leaving 0 users and 0 sessions in the database.

## Must happen before a public launch
1. **Secrets and setup on Cloudflare**, done by the founder (`docs/go-live.md`): `OPENAI_API_KEY`, `DATA_ENCRYPTION_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, the D1 database, `APP_URL`.
2. **Cloudflare rate-limit rules** on `/api/auth/*` and `/api/read-lead` (`docs/go-live.md` step 5). They are set far above real use, so agents are never limited.
3. **OpenAI:** a separate key for this app with a monthly spending cap. Re-check OpenAI's API data terms before launch.
4. **Privacy policy** (`/privacy`): written in plain words from common good practice (founder decision, 20 Oct 2026: no lawyer for now). Revisit when the company can afford a legal review.
5. **An independent security test** once sign-in is live (founder agreed).
6. **Keep dependencies patched:** run `npm audit` before every release.

## What agents should be told (plain words, on the app's start page)
- Your chats are read on this device. They are never uploaded or saved by us.
- When you ask for an AI read of one person, only the last part of that one conversation is sent to the AI. Nothing is kept afterwards.
- We never contact your leads, sell them, or share them. They stay yours.
- One tap on "Delete everything" removes all of it, any time.
