# Research (19 Oct 2026)

Findings from web research. Items marked "unconfirmed" come from third-party sources and must be checked against official docs before building.

## 1. Chat sources

### Instagram
- **Export:** Settings and privacy → Your activity → Download your information → choose Messages, format **JSON** (default is HTML). Ready in hours to up to 14 days; download link expires after about 4 days. Output: ZIP with `messages/inbox/<thread>/message_1.json` (participants, sender, timestamp, text), reverse chronological.
- **API:** Meta Graph API Conversations endpoint (`/PAGE-ID/conversations?platform=instagram`) works for **Business/Creator** accounts linked to a Facebook Page. **Only the 20 most recent messages per conversation** can be read. Message-request threads inactive 30+ days are not returned. Needs `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, a **verified business** and App Review.
- **Verdict:** export for history; API only for catching new conversations going forward.

### Facebook Messenger
- **Export:** Facebook "Download your information", JSON, same structure as Instagram.
- **API:** Page Conversations API, Page inbox only (not personal Messenger). App Review required.

### WhatsApp
- **Export:** per chat, "Export chat" → `.txt` (or `.zip` with media). One chat at a time. Date/time format depends on the phone's language and region, so the parser must handle several formats.
- **API (best option):** WhatsApp Business **Coexistence**: the agent links their WhatsApp **Business app** number by QR code and keeps using the app; about **6 months** of past chats can be imported **once, during onboarding only** (unconfirmed; vendors say 6 months / 180 days, completed within 24 h). Requires Business app 2.24.17+, not personal numbers, app must be opened every 13 days, some countries excluded. Done through Meta directly or a provider (360dialog, Wati).

### LinkedIn
- **Export:** Settings & Privacy → Data privacy → Get a copy of your data → `messages.csv` (layout may vary).
- **API:** no messaging API for ordinary apps. Export only.

## 2. CINC (Commissions Inc)
- Has a **Public API** for two-way integrations. Partners request access at **integrations@cincpro.com**. Zapier also connects on Ramp, Pro and Select plans.
- Unconfirmed details (sources disagree): API key header (`X-API-Key`, base `api.cincpro.com`) vs OAuth bearer (`public.cincapi.com/v2`). Reported endpoints: list/get/create/update leads (status, notes, assigned agent), contacts, activities. No MLS or transaction data.
- Pricing not public.
- **Next step:** get official docs and credentials from CINC (draft email in `cinc-api-request.md`).

## 3. Market
- **Ylopo AI²** (AI text + voice re-contacting old database leads, books appointments), **Structurely** (AI outreach, mortgage focus), **Revaluate, Zurple, SmartZip**. Their reactivation numbers are vendor marketing claims, not independent.
- Most auto-message the whole database. Our difference: reads real conversations across channels, explains why each lead is worth reviving, drafts in the agent's voice, agent sends.

## Sources
- [CINC integrations](https://www.cincpro.com/features/integrations)
- [Jentic: CINC API description](https://jentic.com/apis/cincpro)
- [Pipedream: CINC](https://pipedream.com/apps/cinc)
- [Meta: Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations)
- [Meta: Conversation reference](https://developers.facebook.com/docs/graph-api/reference/conversation/)
- [Ayrshare: get messages (20 message cap)](https://www.ayrshare.com/docs/apis/messages/get-messages.md)
- [360dialog: WhatsApp Coexistence](https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence)
- [Wati: Coexistence onboarding](https://support.wati.io/en/articles/11822421-onboarding-to-whatsapp-coexistence-coex-via-wati)
- [Instagram export guide (takeoutday)](https://takeoutday.org/guides/how-to-export-instagram-data)
- [Redact: Instagram data file contents](https://redact.dev/blog/instagram-data-file-download)
- [LinkedIn export guide (takeoutday)](https://takeoutday.org/guides/how-to-export-linkedin-data)
- [Ylopo: lead reactivation](https://www.ylopo.com/lead-reactivation-crm)
- [Structurely: dormant leads](https://www.structurely.com/news/insights/how-mortgage-teams-can-reactivate-dormant-leads-with-ai-powered-outreach)
