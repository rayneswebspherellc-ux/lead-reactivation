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

## Must happen before a public launch
1. **Login.** Google sign-in (and email). The founder chooses the provider; the session's verified user id feeds `LeadStore.forOwner`. Then add the server delete endpoint behind the existing "Delete everything" button.
2. **Secrets on Cloudflare:** `OPENAI_API_KEY`, and `DATA_ENCRYPTION_SECRET` (at least 32 random characters, never reused, kept out of the repo).
3. **A Cloudflare rate-limit rule on `/api/*`.** The in-app limit is per Worker instance only.
4. **OpenAI data terms.** Confirm API data is not used for training (OpenAI's stated default for the API) and check its retention period. Consider asking OpenAI for zero data retention, and name OpenAI in the privacy policy.
5. **A privacy policy and terms for this app**, in plain words (what is read, where, what is sent, what is stored, how to delete). Reviewed by a lawyer, since agents are in the UAE, Bahrain, the U.S. and Canada (UAE PDPL, Bahrain PDPL, CCPA, PIPEDA).
6. **An independent security test** (penetration test) once login is live.
7. **Keep dependencies patched:** run `npm audit` before every release.

## What agents should be told (plain words, on the app's start page)
- Your chats are read on this device. They are never uploaded or saved by us.
- When you ask for an AI read of one person, only the last part of that one conversation is sent to the AI. Nothing is kept afterwards.
- We never contact your leads, sell them, or share them. They stay yours.
- One tap on "Delete everything" removes all of it, any time.
