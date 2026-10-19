# Lead Reactivation (working name)

A private RaynesWebSphere project: an app that helps real estate agents find **dead leads** (people who were interested and went quiet), explains **why** each one is worth contacting again, and drafts the message. The agent stays in control and sends it themselves.

Inputs:
- **CRM connection** (first: CINC, Commissions Inc)
- **Chat exports** dropped into the app: Instagram, Facebook Messenger, WhatsApp, LinkedIn, CSV

Status: chat readers and dead-lead rules built and tested (`src/lib/`). App screens and AI reading come next. See `docs/plan.md`.

```
npm install
npm run typecheck
npm test            # all readers, on made-up chats
npm run test:scale  # 1,000,000 messages / 5,000 conversations
```

Never put real chat exports in this repo.

| File | What it is |
|---|---|
| `docs/plan.md` | The approved plan: how the app works, stack, phases |
| `docs/research.md` | What each platform and CINC allow, with sources |
| `docs/export-guides.md` | How an agent exports chats from each platform |
| `docs/cinc-api-request.md` | Draft email to CINC to request API access |
| `docs/export-formats.md` | What every platform's export looks like, sizes and quirks |
| `docs/case-study-video.md` | What we learned from the YouTube case study |
