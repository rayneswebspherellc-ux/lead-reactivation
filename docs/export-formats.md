# What chat exports look like (research, 19 Oct 2026)

How each platform's "download your data" file is built, how big it gets for a
busy agent, and how our readers (`src/lib/parsers/`) handle it. Facts marked
**unconfirmed** come from third-party guides or tools and must be checked
against a real export before launch. Sources are at the end.

## The busy agent we design for
About 40 new DMs a day, every day, for 3 years:
- about 14,600 incoming messages a year, roughly 30,000 a year with replies, **about 90,000 messages in 3 years**
- **3,000 to 6,000 conversations**, most of them short (one question, one answer), a few with thousands of messages
- text alone: about 30 MB of JSON (Meta writes roughly 300 to 400 bytes per message), about 5 MB zipped
- with photos, videos and voice notes: **several GB**, split over several ZIP files

Our test (`tests/scale.test.ts`) uses 10 times that: **5,000 conversations, 1,000,000 messages**, one chat with 200,000 messages split over 20 files, plus media to skip. Result on the build machine: read in about 7 seconds, about 107 MB of memory kept.

## How the reader copes with any size
- **ZIPs are read as a stream**, 32 KB at a time. Only small text files (.json, .txt, .csv, .html, and ZIPs inside ZIPs, two levels deep) are unpacked. Photos, videos and voice notes are never unpacked or kept, so a 10 GB export costs the same as a 50 MB one.
- **Each conversation keeps only its first 6 and last 60 messages as text.** Every message is still counted (who wrote, when, how many). A chat with a million messages uses the same memory as one with a hundred.
- **One file over 512 MB** (adjustable) is skipped with a warning, to protect against corrupt or malicious ZIPs.
- **Split exports join up.** Parts of the same chat (message_1.json, message_2.json …) are joined wherever they are, in any order, across any number of ZIPs, with or without a top folder.
- **Exporting again is safe.** If the same chat arrives in two exports (March and October), only the newer copy is kept, so nothing is counted twice. Copies renamed by the browser ("message_1 (1).json", "_chat - Copy.txt") are recognised.
- **Unknown layouts still work.** If a JSON file is not a format we know, we search it for anything shaped like messages (a sender, a time, some text). This covers changed Meta layouts and the Messenger encrypted-chat download.
- **Plan:** the reading runs **in the agent's browser**, so the private chats never leave their device; only the shortlisted dead leads' excerpts go to the server for the AI read.

## Instagram
- **Where:** Settings → Accounts Center → Your information and permissions → Download your information → Messages, **Format: JSON**, All time. Ready in hours to days (**unconfirmed:** up to 14 days); the download link expires after about 4 days.
- **Layout:** `instagram-<user>-<date>-<id>/your_instagram_activity/messages/inbox/<name>_<id>/message_1.json`. Long chats continue in `message_2.json` … with `message_1` holding the **newest** messages. Other folders: `message_requests` (people who never got a reply, which are often the best dead leads), and possibly others. **Unconfirmed:** the exact folder names; Meta warns the structure can change. Media sits in `photos/`, `videos/` and `audio/` next to the JSON.
- **File:** `{ participants: [{name}], messages: [{sender_name, timestamp_ms, content?, photos?, videos?, audio_files?, share?, reactions?, is_unsent?, call_duration?}], title, is_still_participant, thread_path }`.
- **Quirks we handle:**
  - **Garbled characters (mojibake):** text is written as UTF-8 bytes read as Latin-1, so "é" arrives as "Ã©" and emoji arrive scrambled. We repair it, including Arabic.
  - **Time:** `timestamp_ms` is in milliseconds (UTC).
  - **Platform lines that are not conversation:** "Liked a message", "Reacted ❤ to your message", "X sent an attachment.", "Replied to your story", calls, "You are now connected". We keep them on the timeline but never count them as the lead talking. These phrases are in the account's language; non-English ones fall through as text and the AI judges them later.
  - **Deleted accounts** show as "Instagram User".
  - **HTML exports:** the default format is HTML, and it is now read directly (see the confirmed Facebook HTML section). Instagram's HTML export is assumed to use the same layout, since Meta generates both; this is not yet confirmed.
- **Size:** big accounts come as several ZIPs. **Unconfirmed:** the size at which Meta splits.

## Facebook HTML export: confirmed on a real file (20 Oct 2026)
The founder's own export (HTML, 28 MB, 1,028 files) settled most open questions:
- **Layout:** `your_facebook_activity/messages/<folder>/<name>_<id>/message_1.html`, one page per conversation. There was no top folder inside the ZIP.
- **Folders seen:** `inbox` (421), `archived_threads` (50), `e2ee_cutover` (16), `e2ee_cutover_archived` (12, not in any guide), `filtered_threads` (11), `message_requests` (9).
- **Page:** `<h1>` is the conversation title. `<aside>` says "Generated by <owner> on … UTC+01:00", which gives the account owner and the time zone. Each `<section>` is one message:
  - `<h2>` holds the sender
  - a `<div>` holds the text, `<img>` for photos, `<a>` for links, and `<ul><li>` for reactions (which are not message text)
  - `<footer>` holds the date, e.g. "Mar 05, 2026 4:44:47 pm"
- Class names are obfuscated (`_a6-g`, `_a72d`), so the reader uses tags only.
- **Platform lines appear as messages:** "You're now connected on Messenger", "You can now message and call each other…", "This message was unsent", "Reacted ❤ to your message", "A contact added participants.", "A contact created the group chat."
- **Some sections have no sender** (system entries). 3,820 messages in 519 chats, median 1 message per chat, 23 chats with 3+ people.
- **Result:** all 519 chats read in about 1 second in the browser; the owner is detected without asking.
- **Ranking lessons** (now in `dormancy.ts`):
  - Single everyday words ("home", "budget", "sell") in friends' chats looked like buying intent, so intent is now judged per message.
  - Service sellers (credit repair and similar) looked like buyers, so they are now left out with the reason "selling something to you".
  - "Happy New month" type chats are now marked small talk.

## Facebook Messenger
- **Where:** Accounts Center → Download your information → Messages, JSON, All time.
- **Layout:** same as Instagram: `…/messages/inbox/<name>_<id>/message_N.json`, plus folders such as `message_requests`, `filtered_threads` and `archived_threads` (**unconfirmed** names). Same JSON fields, same garbled characters, same newest-first order.
- **Missing chats:** end-to-end encrypted chats (now the default for personal chats) are **not** in this export. They come from a separate **secure storage** download (Settings → Privacy & safety → End-to-end encrypted chats → Message storage), as JSON in a ZIP. **Unconfirmed:** its exact JSON layout, so the "anything shaped like messages" fallback reads it. Unsent messages and deleted chats are never exported.
- A Facebook **Page** inbox (business) is a different product, for the live connection later.

## WhatsApp
- **Where:** in each chat, ⋮ → More → Export chat (Android) or contact name → Export chat (iPhone). **One chat at a time.** Choose "Without media".
- **Files:** Android gives `WhatsApp Chat with <name>.txt` (with media, a ZIP). iPhone gives `WhatsApp Chat - <name>.zip` containing `_chat.txt` plus media. The chat name (the file name) is the other person, or their phone number if they are not saved.
- **Limits** (WhatsApp Help Center, **to re-check**): up to about 40,000 most recent messages without media, 10,000 with media.
- **Line format depends on the phone's language and settings:**
  - `14/03/2026, 09:16 - Sara: Hi`: Android, day first, 24 hour
  - `3/14/26, 2:05 PM - John: Hi`: Android, US, month first, 12 hour
  - `[14/03/2026, 09:16:22] Sara: Hi`: iPhone, with seconds; a narrow no-break space before AM/PM
  - `24.12.25, 18:45 - Anna: …`: German style
  - `٢٠٢٦/٣/١٤، ٢:٠٥ م - أحمد: …`: Arabic phones use Arabic digits, the Arabic comma, ص (AM) and م (PM), and direction marks
  - `2026-03-14, 09:16 - …`: year first
- **Quirks we handle:**
  - Messages that run over several lines.
  - System lines with no sender (the encryption notice, "X added Y"). On iPhone the notice appears under the chat name.
  - Media placeholders in several languages: `<Media omitted>`, `image omitted`, `<attached: …>`, `IMG-….jpg (file attached)`.
  - Deleted messages, the "edited" marker, calls, shared locations.
  - iPhone's invisible mark in front of media and system lines.
  - **Day/month order** is worked out from the whole chat: a day above 12 settles it; otherwise we pick the reading in which the chat runs forward in time. If it is still unclear we use the default and warn.
  - **Times have no time zone.** They are the phone's local time, so we apply the agent's time zone.
- **Which person is the agent:** the chat is named after the other person, so whoever else writes is the agent. That works even from a single file.
- **The real limit is effort, not format:** an agent with 3,000 chats cannot export them one by one. That is why the **WhatsApp Business connection** (about 6 months of history at sign-up) is on the roadmap.

## LinkedIn
- **Where:** Me → Settings & Privacy → Data privacy → Get a copy of your data → Messages (or everything). A first ZIP arrives in minutes; the full archive can take longer.
- **File:** `messages.csv`, one row per message: `CONVERSATION ID, CONVERSATION TITLE, FROM, SENDER PROFILE URL, TO, RECIPIENT PROFILE URLS, DATE, SUBJECT, CONTENT, FOLDER, ATTACHMENTS, IS MESSAGE DRAFT` (**unconfirmed** exact header; the reader finds columns by name, in any order). One account in the sources had about 12,500 rows.
- **Quirks we handle:**
  - Message text can contain commas, quotes, line breaks and HTML (InMail).
  - Dates look like `2024-01-15 10:30:00 UTC`.
  - Drafts are skipped.
  - The `SPAM` folder is kept, but those leads are not suggested.
  - Other CSVs in the archive (coach and guide messages, connections) are ignored.
  - The lead's profile URL is kept, so the same person can be linked across files.
- Only messages still in the inbox are exported.

## TikTok
- **Where:** Settings and privacy → Account → Download your data → **JSON**. Ready in 1 to 4 days; the link expires after about 4 days.
- **File (unconfirmed):** `user_data.json` / `user_data_tiktok.json`. Direct messages are under a "Direct Message(s)" section, as `"Chat History with <name>:": [{ "Date", "From", "Content" }]`. TikTok's own Data Portability API uses the same three fields. The nesting has changed between versions, so the reader searches the whole file for that shape. Dates are assumed to be UTC. **Needs a real sample before launch.**

## YouTube
- **No direct messages to import.** YouTube shut its messaging feature down on 18 Sep 2019. A small relaunch in some countries is reported, but nothing appears in Takeout for it. Leads on YouTube are **comments**: Google Takeout → YouTube → comments (CSV). Possible later, as a different kind of lead (a public comment, not a chat).

## Telegram (bonus, common in the UAE and Bahrain)
- **Where:** Telegram Desktop → Settings → Advanced → Export Telegram data (or a single chat's ⋮ → Export chat history), format **Machine-readable JSON** → `result.json`.
- **File:** either one chat `{ name, type, id, messages }` or the whole account `{ personal_information, chats: { list: [...] } }`. Each message: `{ type: "message"|"service", date, date_unixtime, from, from_id, text }`, where `text` is a string or a list of pieces. We skip channels and Saved Messages, and take the agent's name from `personal_information`.

## CINC (CRM)
CSV export of leads and notes first, then the CINC API once access is granted. Phase 4.

## What we still need (before launch)
1. **One real export from each platform** from the founder or the pilot agent, to confirm the "unconfirmed" items. It stays on their machine and is **never committed** (the `.gitignore` blocks ZIPs).
2. Meta **HTML** support, if agents keep sending HTML exports by mistake.
3. Very large ZIPs (over 4 GB, "ZIP64") and Windows' "Deflate64" compression: the reader will skip unreadable parts with a warning, but this must be tested on a real big export.
4. Platform phrases ("Liked a message" and so on) in Arabic and other languages, from real samples.

## Sources
- Instagram: [chatpeek guide](https://chatpeek.app/guides/export-instagram-dms/), [mosaicchats](https://www.mosaicchats.com/blog/how-to-export-instagram-messages), [readbeneath](https://readbeneath.com/guides/export-instagram-dms), [dev.to example of the JSON](https://dev.to/raicuparta/ditching-worthless-friends-with-facebook-data-and-javascript-3f2i), [instagram-message-extractor (encoding fix)](https://github.com/typh403/instagram-message-extractor), [igexporter](https://github.com/shakibbinkabir/igexporter), [Instamp](https://github.com/BalajiRKB/Instamp), [redact.dev](https://redact.dev/blog/instagram-data-file-download)
- Facebook: [Simple Messenger JSON Explorer](https://github.com/serogee/Simple-Messenger-JSON-Explorer), [mosaicchats Messenger](https://www.mosaicchats.com/blog/how-to-export-messenger-chat), [Meta help: encrypted chat download](https://www.facebook.com/help/messenger-app/677912386869109), [Decipher: missing Messenger messages](https://deciphertools.com/support/knowledge-base/missing-newer-facebook-messages/), [Tansee guide](https://www.tansee.com/how-to-download-end-to-end-encrypted-messenger-messages-from-facebook.html), [split export advice](https://help.measureprotocol.com/support/solutions/articles/80001099386-facebook-data-file-retro-instructions)
- WhatsApp: [zapptales](https://www.zapptales.com/en/how-to-export-whatsapp-chat-android-iphone-ios/), [chattopdf ZIP contents](https://chattopdf.app/blog/export-chat-whatsapp), [chattopdf without media](https://chattopdf.app/blog/whatsapp-export-without-media), [mosaicchats WhatsApp](https://www.mosaicchats.com/blog/how-to-export-whatsapp-chat), and the open-source [whatsapp-chat-parser](https://www.npmjs.com/package/whatsapp-chat-parser) (MIT), read as a reference for line formats
- LinkedIn: [LinkedIn file (column list)](https://jennyqueenofswords.github.io/linkedin-exposed/), [gist reading messages.csv](https://gist.github.com/guy4261/c55cccaac4c816d287349bfaf4d76e4b), [zyxware analyzer](https://www.zyxware.com/article/6915/whats-inside-your-linkedin-messages-linkedin-communication-analyzer)
- TikTok: [TikTok Data Portability data types](https://developers.tiktok.com/docs/en/data-portability-data-types?enter_method=left_navigation), [takeoutday TikTok](https://takeoutday.org/guides/how-to-export-tiktok-data), [ScrollBack guide](https://scroll-back.com/guides/how-to-download-your-tiktok-data), [dataexportviewer](https://dataexportviewer.com/tiktok-data-viewer/)
- YouTube: [Engadget, 2019](https://www.engadget.com/2019-08-20-youtube-killing-direct-messaging.html), [YouTube Help announcement](https://support.google.com/youtube/thread/12446824/heads-up-we%E2%80%99re-removing-the-ability-to-message-directly-on-youtube-after-september-18?hl=en), [Root Nation on the relaunch](https://root-nation.com/en/news-en/it-news-en/en-youtube-has-brought-back-dms/)
- Telegram: [Telegram export schema](https://core.telegram.org/import-export), [LangChain Telegram loader example](https://python.langchain.com/docs/integrations/chat_loaders/telegram)
