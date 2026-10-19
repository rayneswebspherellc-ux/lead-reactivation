# Dead Lead Reactivation App: plan

## Context
The founder wants an app for real estate agents that finds "dead" leads (people who were interested once and went quiet) and tells the agent who to contact again, why, and what to say. The inputs are chat histories (Instagram, Facebook, LinkedIn, WhatsApp and others) and, later, a direct CRM connection. The first real user runs **CINC** (Commissions Inc). This is the planning phase. **Nothing in `rayneswebsphere-website`, the Steward app or any other existing repo gets touched.** Everything lives in a new private repo.

Decisions confirmed by the founder:
- CRM = **CINC**
- Repo name = **`lead-reactivation`** (private, under `rayneswebspherellc-ux`)
- V1 output = **ranked list + AI-drafted message per lead**. The agent sends it themselves. No automatic sending in V1.

## Step 1 (first action): create the new private repo
- Use `mcp__github__create_repository`: name `lead-reactivation`, `private: true`, with a README. **Problem:** this session's GitHub access is scoped to `rayneswebsphere-website` only, so creation may be refused. If it is, the founder creates the empty private repo at github.com/new (one minute) and I attach it with `add_repo`. I make no writes to any other repo either way.
- Clone it outside the website folder (for example `/home/user/lead-reactivation`) and work only there.
- Commit `docs/` first (this research and plan), then the code skeleton.

## Research findings (what is and is not possible)

### Getting the chats
| Source | Self-export (agent downloads a file) | Direct connection (no export) |
|---|---|---|
| **Instagram** | "Download your information", choose **JSON**, Messages → ZIP with `messages/inbox/<thread>/message_1.json`. Takes hours to days. | Meta Graph API for **Business/Creator** accounts linked to a Facebook Page. **Only the last 20 messages per conversation** are readable, and the app needs Meta business verification + App Review. Good for new messages going forward, weak for old history. |
| **Facebook Messenger** | Same Meta export, JSON. | Page Conversations API (Page inbox only, not personal Messenger). Needs App Review. |
| **WhatsApp** | Per chat "Export chat" → `.txt` (or `.zip` with media). One chat at a time, phone formats vary by locale. | **WhatsApp Business "Coexistence"**: agent scans a QR code, keeps using the Business app, and about **6 months of history** syncs once at onboarding. Business app only, not personal numbers. Best path for WhatsApp. |
| **LinkedIn** | "Get a copy of your data" → `messages.csv`. | No messaging API for normal apps. Export only. |
| **SMS / iMessage / email / other** | CSV upload, or forwarding. | Gmail API later if wanted. |

**Conclusion:** No platform gives a clean, full-history "connect and read everything" button for personal accounts. The premium path is a hybrid:
1. **CRM connection** (CINC) = the main no-export experience. The CRM already holds the leads, notes and activity.
2. **Guided drop zone** for exports: the agent drops the ZIP/TXT/CSV, the app detects which platform it came from, with step-by-step export guides on screen.
3. **Live connections later** (Instagram/Facebook Business via Meta, WhatsApp Coexistence). These catch leads going cold from now on. They need Meta business verification, which takes weeks, so start that paperwork early.

### CINC
- CINC has a **Public API** for two-way integrations. Access goes through **integrations@cincpro.com** (partner request), plus Zapier on Ramp/Pro/Select plans.
- Third-party sources disagree on details (API key header vs OAuth, `api.cincpro.com` vs `public.cincapi.com/v2`). Endpoints reported: leads list/get/create/update (status, notes, assigned agent), contacts, activities.
- **Action for the founder:** email integrations@cincpro.com (I draft the email) to get API credentials and official docs. Until then, build against a mock CINC adapter and also accept a **CINC CSV export** so the first user can be served right away.
- Write-back: after the agent acts, the app adds a note / updates the lead status in CINC so the CRM stays the source of truth.

### Market
Ylopo AI², Structurely, Revaluate, SmartZip already do AI reactivation, mostly by **auto-texting the whole database**. Our angle: reads the actual conversations (any channel, not just the CRM), explains *why* each lead is worth reviving, and drafts a message in the agent's own voice. Agent stays in control. Fits RaynesWebSphere's "AI won't think for you" stance.

## How the app works (V1)
1. **Import:** connect CINC, or drop export files.
2. **Normalize:** every source becomes one format: `Contact { name, handles, phone, email, source }` + `Message { contactId, direction (agent/lead), timestamp, text, channel }`. Merge the same person across channels (phone/email/name matching).
3. **Find dead leads (rules, no AI cost):** lead's last message older than N days (default 30), no reply from the agent after the lead's last message, or the conversation ended mid-discussion.
4. **Score with AI:** for each candidate, send a trimmed conversation summary to an LLM that returns structured JSON: intent (buyer / seller / renter / investor), budget and area if mentioned, timeline, why it went cold, reactivation score 0 to 100, reason in one line, a drafted message in the agent's tone, best channel.
5. **Dashboard:** ranked list "Contact these today", filters (channel, score, intent), per-lead card with the reason, the original chat snippet and the draft with a copy button / "open in WhatsApp" deep link. Mark as contacted, push a note to CINC.

## Tech stack (matches what the team already runs)
- **Next.js 16 + TypeScript + Tailwind v4** web app (installable as a PWA on phones, no app store needed for V1).
- **Hosting:** Cloudflare Workers via `@opennextjs/cloudflare` (same as the website). **D1** for accounts, leads and scores; **R2** for uploaded files (deleted after parsing).
- **AI:** OpenAI GPT-4o-mini (key already used on the website) for scoring and drafts. Pluggable so Claude can be swapped in.
- **Auth:** email magic link (Resend is already set up) or Clerk.
- **Privacy:** these are clients' private conversations. Parse uploads, store only what scoring needs, delete raw files, encrypt CRM tokens, per-agent data isolation, clear privacy page. Matches the founder's promise "your leads stay yours".

## Repo layout (`lead-reactivation`)
```
docs/
  research.md            # findings above, with sources
  plan.md                # this plan
  cinc-api-request.md    # draft email to integrations@cincpro.com
  export-guides.md       # how agents export Instagram/FB/WhatsApp/LinkedIn
src/
  lib/parsers/           # instagram.ts, facebook.ts, whatsapp.ts, linkedin.ts, csv.ts, detect.ts
  lib/normalize.ts       # Contact/Message types + cross-channel merge
  lib/dormancy.ts        # rule-based dead-lead detection
  lib/score.ts           # LLM scoring + drafted message (structured JSON)
  lib/crm/               # adapter interface; cinc.ts (mock until credentials), csv-import.ts
  app/                   # upload page, dashboard, lead detail, settings (CRM connect)
tests/fixtures/          # small fake exports per platform (no real chats)
```

## Phases
1. **Repo + docs** (now): create repo, commit research, plan, CINC email draft, export guides.
2. **Parsers + dormancy engine** with tests on fake sample exports for all four platforms.
3. **AI scoring + drafted messages**, dashboard UI (premium dark style, RaynesWebSphere tokens).
4. **CINC**: CSV import first; API adapter once credentials arrive; write-back notes.
5. **Pilot** with the CINC user on their real data (their export, their consent).
6. **Later:** Meta Business connection (Instagram/Facebook), WhatsApp Coexistence, more CRMs (Follow Up Boss, Lofty, kvCORE), optional sending with opt-out and US TCPA compliance.

## What I need from the founder
- Email CINC at integrations@cincpro.com (I draft it) to get API access.
- If repo creation is refused from this session: create an empty private repo `lead-reactivation` on GitHub and tell me.
- Later: a product name, and the pilot user's permission to use their data.

## Verification
- `npx tsc --noEmit`, `npx eslint src` clean; unit tests pass for each parser against fixtures (correct contacts, message counts, directions, timestamps, locale variants of WhatsApp dates).
- Dormancy rules tested with crafted timelines.
- End to end: drop a fake Instagram ZIP + WhatsApp TXT + LinkedIn CSV → dashboard lists the expected dead leads, ranked, with drafts.
- Confirm `git status` in `rayneswebsphere-website` shows no changes from this work.
