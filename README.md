# Lead Reactivation (working name)

A private RaynesWebSphere project: an app that helps real estate agents find **dead leads** (people who were interested and went quiet), explains **why** each one is worth contacting again, and drafts the message. The agent stays in control and sends it themselves.

Inputs:
- **CRM connection** (first: CINC, Commissions Inc)
- **Chat exports** dropped into the app: Instagram, Facebook Messenger, WhatsApp, LinkedIn, CSV

Status: chat readers, dead-lead rules, the app screens and the AI read are built and tested. Not deployed yet. See `docs/plan.md`.

```
npm install
npm run dev         # http://localhost:3000
npm run typecheck
npm run lint
npm test            # readers, rules and AI safety rules, on made-up chats
npm run test:scale  # 1,000,000 messages / 5,000 conversations
```

The AI read needs `OPENAI_API_KEY` (optional `OPENAI_MODEL`, default `gpt-4o-mini`) in `.env.local`. Without it the app works and says the AI is not connected.

### Wording written by the AI (needs founder OK)
All on-screen text was written by the AI: page titles ("Find The Leads Worth Contacting Again", "How To Export Your Chats", "Which One Is You?", "Your Dead Leads", "Reading your conversations"), buttons ("Choose files", "Find dead leads", "Read top 20 with AI", "Read this lead", "Copy", "Open in WhatsApp", "New import", "Continue", "Show more"), the outcome labels (Contacted, Replied, Viewing booked, Closed, Not interested), the stat labels, the "left out" reasons, the privacy lines ("Your chats are read on this device…"), the export guide steps, the dashboard headline and tier names ("Contact today", "This week", "When you have time" and their one-line explanations), the three "how to use" steps, the plain-language reason chips ("never got your reply", "asked you a question"…), "Chance they reply and act", and the delete dialog ("Delete Everything?", "Keep my data", "Yes, delete everything"). The product name "Lead Reactivation" is a placeholder.

Never put real chat exports in this repo.

| File | What it is |
|---|---|
| `docs/plan.md` | The approved plan: how the app works, stack, phases |
| `docs/research.md` | What each platform and CINC allow, with sources |
| `docs/export-guides.md` | How an agent exports chats from each platform |
| `docs/cinc-api-request.md` | Draft email to CINC to request API access |
| `docs/export-formats.md` | What every platform's export looks like, sizes and quirks |
| `docs/security.md` | Security and privacy: what is protected, what must happen before launch |
| `docs/case-study-video.md` | What we learned from the YouTube case study |
