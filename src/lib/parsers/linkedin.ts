import { headerIndex, readCsv } from "../csv";
import type { RawMessage, ThreadPart } from "../types";

/**
 * LinkedIn "Get a copy of your data" → messages.csv. One row per message:
 * CONVERSATION ID, CONVERSATION TITLE, FROM, SENDER PROFILE URL, TO,
 * RECIPIENT PROFILE URLS, DATE ("2024-01-15 10:30:00 UTC"), SUBJECT, CONTENT,
 * FOLDER, ATTACHMENTS, IS MESSAGE DRAFT. CONTENT may span lines and hold HTML
 * (InMail). Other CSVs in the archive (coach / guide messages) are not chats.
 */

export function looksLikeLinkedInMessages(text: string): boolean {
  const first = readCsv(text.slice(0, 2000)).next().value as string[] | undefined;
  if (!first) return false;
  const col = headerIndex(first);
  return col("CONVERSATION ID") >= 0 && col("FROM") >= 0 && col("CONTENT") >= 0 && col("DATE") >= 0;
}

function parseDate(s: string): number {
  const t = s.trim().replace(/ UTC$/, "Z").replace(" ", "T");
  const v = Date.parse(t);
  return Number.isNaN(v) ? Date.parse(s) : v;
}

function stripHtml(s: string): string {
  if (!/[<&]/.test(s)) return s;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseLinkedInMessages(text: string): ThreadPart[] {
  const rows = readCsv(text);
  const header = rows.next().value as string[] | undefined;
  if (!header) return [];
  const col = headerIndex(header);
  const iId = col("CONVERSATION ID");
  const iTitle = col("CONVERSATION TITLE");
  const iFrom = col("FROM");
  const iFromUrl = col("SENDER PROFILE URL");
  const iTo = col("TO");
  const iDate = col("DATE");
  const iSubject = col("SUBJECT");
  const iContent = col("CONTENT");
  const iFolder = col("FOLDER");
  const iAttach = col("ATTACHMENTS");
  const iDraft = col("IS MESSAGE DRAFT");

  const threads = new Map<
    string,
    ThreadPart & { urls: Map<string, string> }
  >();
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    if (/^(yes|true)$/i.test(get(iDraft))) continue;
    const id = get(iId);
    const at = parseDate(get(iDate));
    if (!id || Number.isNaN(at)) continue;
    let t = threads.get(id);
    if (!t) {
      t = {
        channel: "linkedin",
        threadKey: `linkedin:${id}`,
        title: get(iTitle),
        participants: [],
        folder: get(iFolder) || undefined,
        messages: [],
        urls: new Map(),
      };
      threads.set(id, t);
    }
    const from = get(iFrom);
    const names = [from, ...get(iTo).split(",").map((s) => s.trim())].filter(Boolean);
    for (const n of names) if (!t.participants.includes(n)) t.participants.push(n);
    if (from && get(iFromUrl)) t.urls.set(from, get(iFromUrl));
    const subject = get(iSubject);
    const body = stripHtml(get(iContent)).trim();
    const textValue = subject && !body.startsWith(subject) ? `${subject}\n${body}` : body;
    const msg: RawMessage = {
      sender: from || null,
      at,
      text: textValue,
      kind: textValue ? "text" : get(iAttach) ? "media" : "system",
    };
    t.messages.push(msg);
  }
  return [...threads.values()].map(({ urls, ...t }) => ({
    ...t,
    title: t.title || t.participants.join(", "),
    profileUrls: Object.fromEntries(urls),
  }));
}
