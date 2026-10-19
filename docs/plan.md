# Dead Lead Reactivation App: plan (v2, 19 Oct 2026)

## 1. What we are building
An app for real estate agents (Dubai, Bahrain, U.S. & Canada, or any market) that reads their old conversations and tells them **which dead leads to contact again, why, and what that lead cared about**. The agent decides what to offer and sends the message. The app never sends anything itself.

## 2. The core rule: the app only knows the conversations
The app knows only what the agent gives it: uploaded chat history (and later the CINC record of the same lead). It does **not** know the agent's business, listings, developer relationships, upcoming launches, pricing or style.

So:
- **The app finds and explains. The agent decides and offers.** No offer is ever chosen for the agent.
- Every statement about a lead must come from that lead's own conversation, and the app shows the line it came from.
- Where the app helps with an offer, it gives **something to think about**, written as questions built on what the lead said. Example: "She wanted a 2-bed near the Marina under AED 1.5M and stopped replying when financing came up. Do you have anything in that range now? Has anything changed on financing you could share?"
- Nothing is invented: no market facts, no prices, no launches, no urgency the lead did not express.

This is the main difference from the case study (`docs/case-study-video.md`). There, the team built a full AI system around one business, so it knew the offers. We are a product for many agents, so the knowledge of the business stays with the agent.

## 3. Decisions confirmed by the founder
- CRM first: **CINC** (Commissions Inc).
- Repo: `lead-reactivation` (private). Nothing in any other repo is touched.
- V1 output: ranked list + per-lead brief. The agent sends messages themselves.
- No reactivation tied to an offer (19 Oct 2026).

## 4. How the app works (V1)
1. **Import:** drop export files (Instagram, Facebook, WhatsApp, LinkedIn, CSV), or connect CINC.
2. **Normalize:** every source becomes one format: `Contact { name, handles, phone, email, sources }` and `Message { contactId, direction (agent/lead), time, text, channel }`. The same person is merged across channels by phone, email or name.
3. **Find dead leads (rules, no AI cost):** the lead's last message is older than N days (default 30), the agent never replied to the lead's last message, or the talk stopped mid-discussion (a question left open, a viewing not booked).
4. **Read each candidate with AI.** Structured result, every field backed by a quote from the chat:
   - **Interest:** how keen they sounded (0 to 100)
   - **Likelihood:** how close they were to acting (0 to 100)
   - **Who they are:** buyer, seller, renter, investor, unclear
   - **What they wanted:** area, property type, budget, timeline, only if they said it
   - **Stage:** for example "asked for the price then went quiet", "agreed to a viewing but never booked", "said yes, waiting on paperwork", "comparing with another agent"
   - **Why it went cold:** best reading of the conversation, marked as a guess
   - **Something to think about:** 2 or 3 questions for the agent, from the lead's own words (see section 2)
   - **Starting message:** a short, editable opener that only refers back to their last conversation, in the language the lead used. No offer in it. The agent rewrites or adds their offer.
   - **Best channel:** where the lead last answered
5. **Dashboard:** ranked list "Contact these today", filters (channel, stage, who they are), and per-lead card with the summary, the quoted lines, the questions to think about and the opener with copy and "open in WhatsApp" buttons.
6. **Daily Top 5:** the five best leads of the day sent to the agent's phone (email first, WhatsApp later). Small and doable.
7. **Outcome tracking:** the agent marks each lead "contacted", "replied", "viewing booked", "closed", "not interested". The app shows what came from dead leads, so it proves its worth. Outcomes are written back to CINC as notes.

## 5. Works in any market, without business context
- The app reads whatever language the chat is in (English, Arabic, mixed) and writes the opener in the lead's language.
- WhatsApp export reader handles different date formats and Arabic text.
- Local terms (RERA, DLD, Golden Visa, MLS...) are recognised when they appear in the chat; the app never adds them on its own.
- Currencies are kept exactly as the lead wrote them.

## 6. Getting the chats (research in `docs/research.md`)
| Source | V1 | Later |
|---|---|---|
| Instagram | Meta export (JSON) dropped in | Meta Business connection (last 20 messages per chat only; needs Meta verification) |
| Facebook Messenger | Meta export (JSON) | Page inbox connection |
| WhatsApp | Per-chat export (.txt / .zip) | WhatsApp Business "Coexistence" (about 6 months of history, once, at sign-up) |
| LinkedIn | `messages.csv` export | none (no API) |
| TikTok | JSON data download (layout unconfirmed) | none |
| Telegram | Desktop export `result.json` | none |
| YouTube | no DMs since 2019; comments via Takeout | comments as a separate lead type |
| CINC | CSV export of leads and notes | CINC Public API once access is granted (request: `docs/cinc-api-request.md`) |

Agent guides: `docs/export-guides.md`. File formats, sizes and quirks: `docs/export-formats.md`.

**Reading happens in the agent's browser.** Files are read as a stream (any size, media never unpacked), each conversation keeps its first 6 and last 60 messages, and only the shortlisted dead leads' excerpts are sent to the server for the AI read. The private chats never leave the agent's device.

## 7. Tech stack (same as the website team already runs)
- Next.js 16 + TypeScript + Tailwind v4, installable on phones (PWA).
- Cloudflare Workers via `@opennextjs/cloudflare`; D1 for accounts, leads and results; R2 for uploads, deleted after reading.
- AI: OpenAI GPT-4o-mini for reading and drafting (pluggable, Claude can be swapped in).
- Email: Resend (already set up) for login links and the Daily Top 5.
- **Privacy:** these are clients' private conversations. Raw files are deleted after reading, only what the lead card needs is stored, every agent's data is separate, CRM keys are encrypted, a clear privacy page. "Your leads stay yours."

## 8. Repo layout
```
docs/                    plan, research, export guides, CINC email, case study
src/lib/parsers/         meta (Instagram + Facebook), whatsapp, linkedin, telegram, tiktok, generic-json
src/lib/archive.ts       streaming ZIP reader (media skipped)
src/lib/accumulator.ts   one conversation, bounded memory
src/lib/import.ts        files in → conversations, who is the agent, re-export handling
src/lib/identity.ts      same lead across platforms (phone, email, profile URL only)
src/lib/dormancy.ts      rule-based dead-lead detection and ordering
src/lib/read-lead.ts     AI reading (structured, quote-backed)
src/lib/crm/             adapter interface; cinc (mock until access), csv import
src/app/                 upload, dashboard, lead card, settings
tests/fixtures/          small fake exports per platform (never real chats)
```

## 9. Phases
1. Repo + docs. **Done.**
2. Parsers + dead-lead rules, tested on fake exports (including Arabic WhatsApp and a 1,000,000-message test). **Done (19 Oct 2026), in `src/lib/`.** Needs one real export per platform to confirm the unconfirmed details in `docs/export-formats.md`.
3. AI lead reading + dashboard + lead card (premium dark style). **Built (19 Oct 2026):** drop zone with export guides, reading in a background worker with progress, "Which one is you?", dashboard (dead / active / left out, platform filter, "Read top 20 with AI"), lead card (AI read, quotes, questions to think about, opener with Copy / Open in WhatsApp, outcome buttons, latest messages). Outcomes are saved on the device only until accounts exist. The AI read needs `OPENAI_API_KEY` on the server; without it the app says so honestly. **Not deployed yet.**
4. CINC: CSV import first, API once access arrives, outcome notes written back.
5. Daily Top 5 email + outcome tracking.
6. Pilot with the CINC user on their real data, with their consent.
7. Later: "who buys from me" report built from the agent's own past conversations; Meta and WhatsApp Business connections; more CRMs (Follow Up Boss, Lofty, kvCORE); keyword auto-reply and follow-up for people who start but do not finish.

## 10. What we need from the founder
- Send the CINC email (draft in `docs/cinc-api-request.md`).
- Later: a product name, and the pilot user's permission to use their data.

## 11. Verification
- `npx tsc --noEmit` and `npx eslint src` clean; parser tests pass on fixtures (contacts, message counts, who said what, times, WhatsApp date formats, Arabic).
- Dead-lead rules tested on made-up timelines.
- AI check: every field on a lead card has a supporting quote; no offers, prices or facts that are not in the chat.
- End to end: drop a fake Instagram ZIP + WhatsApp TXT + LinkedIn CSV and the dashboard shows the expected dead leads, ranked, with quotes and questions.
