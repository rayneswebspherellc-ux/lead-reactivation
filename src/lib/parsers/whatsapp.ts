import { nameKey, normaliseSpaces, stripInvisible, toAsciiDigits } from "../text";
import type { MessageKind, RawMessage, ThreadPart } from "../types";

/**
 * WhatsApp "Export chat" text (Android: one .txt; iPhone: .zip with _chat.txt).
 * One chat per file, written in the phone's language and date format, so the
 * header of each line varies:
 *   12/03/2023, 14:05 - John: Hi                  (Android, 24h)
 *   3/12/23, 2:05 PM - John: Hi                   (Android, US)
 *   [12/03/2023, 14:05:22] John: Hi               (iPhone)
 *   [3/12/23, 2:05:22 PM] John: Hi                (iPhone, US, U+202F before PM)
 *   12.03.23, 14:05 - John: Hi                    (German)
 *   ١٢‏/٣‏/٢٠٢٣، ٢:٠٥ م - John: Hi                  (Arabic: Arabic digits, ، and ص/م)
 *   2023-03-12, 14:05 - John: Hi                  (year first)
 * Lines without a header continue the previous message (multi-line messages).
 * Times carry no time zone: they are the exporting phone's local time.
 */

const AMPM = "([AaPp]\\.?\\s?[Mm]\\.?|ص|م)";
const DATE = "(\\d{1,4})[./-](\\d{1,2})[./-](\\d{1,4})";
const TIME = "(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?";
const BRACKET = new RegExp(`^\\[${DATE}[,،]?\\s*${TIME}\\s*${AMPM}?\\]\\s?(.*)$`);
const DASH = new RegExp(`^${DATE}[,،]?\\s*${TIME}\\s*${AMPM}?\\s*-\\s(.*)$`);

interface Header {
  a: number;
  b: number;
  c: number;
  h: number;
  mi: number;
  s: number;
  ampm: string | null;
  rest: string;
  /** iPhone marks system and media lines with a U+200E before the text. */
  marked: boolean;
}

function readHeader(rawLine: string): Header | null {
  const line = normaliseSpaces(toAsciiDigits(stripInvisible(rawLine)));
  const m = BRACKET.exec(line) ?? DASH.exec(line);
  if (!m) return null;
  const rest = m[8] ?? "";
  // iPhone lines: "[date, time] Name: <U+200E>image omitted". The mark follows the name.
  const close = rawLine.indexOf("]");
  const afterName = close >= 0 ? rawLine.indexOf(": ", close) : -1;
  const marked = afterName >= 0 && rawLine.charCodeAt(afterName + 2) === 0x200e;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    c: Number(m[3]),
    h: Number(m[4]),
    mi: Number(m[5]),
    s: Number(m[6] ?? 0),
    ampm: m[7] ?? null,
    rest,
    marked,
  };
}

export function looksLikeWhatsApp(text: string): boolean {
  const lines = text.split(/\r\n|\r|\n/, 40);
  let hits = 0;
  for (const l of lines) if (readHeader(l)) hits++;
  return hits >= Math.min(2, lines.filter((l) => l.trim()).length);
}

export type DateOrder = "dmy" | "mdy" | "ymd";

/** Decide day-first vs month-first from every date in the file. */
export function inferDateOrder(
  headers: Pick<Header, "a" | "b" | "c">[],
  fallback: "dmy" | "mdy",
): { order: DateOrder; ambiguous: boolean } {
  if (headers.some((h) => h.a > 31)) return { order: "ymd", ambiguous: false };
  if (headers.some((h) => h.a > 12)) return { order: "dmy", ambiguous: false };
  if (headers.some((h) => h.b > 12)) return { order: "mdy", ambiguous: false };
  // Chats run forward in time: the reading with fewer backwards jumps wins.
  const back = (order: "dmy" | "mdy") => {
    let n = 0;
    let prev = -Infinity;
    for (const h of headers) {
      const [d, mo] = order === "dmy" ? [h.a, h.b] : [h.b, h.a];
      const y = h.c < 100 ? 2000 + h.c : h.c;
      const v = y * 10000 + mo * 100 + d;
      if (v < prev) n++;
      prev = v;
    }
    return n;
  };
  const dmy = back("dmy");
  const mdy = back("mdy");
  if (dmy < mdy) return { order: "dmy", ambiguous: false };
  if (mdy < dmy) return { order: "mdy", ambiguous: false };
  return { order: fallback, ambiguous: true };
}

const MEDIA_RE =
  /^(<[^<>]{2,80}>|(image|video|audio|sticker|gif|document|contact card|photo) omitted|.{1,120}\.(jpe?g|png|webp|heic|mp4|mov|opus|ogg|m4a|mp3|pdf|docx?|xlsx?|vcf) \((file attached|archivo adjunto|fichier joint|datei angehängt)\)|null|.{0,40}\(file attached\))$/i;
const DELETED_RE =
  /^(this message was deleted\.?|you deleted this message\.?|تم حذف هذه الرسالة\.?|لقد حذفت هذه الرسالة\.?|se eliminó este mensaje\.?|ce message a été supprimé\.?|diese nachricht wurde gelöscht\.?)$/i;
const CALL_RE =
  /^(missed (voice|video) call|(voice|video) call|مكالمة (صوتية|فيديو)( فائتة)?)( .{0,30})?$/i;
const LOCATION_RE = /^(location|live location shared|الموقع): /i;
const ENCRYPTION_NOTICE_RE = /end-to-end encrypted|مشفرة|مشفّرة/i;
const EDITED_RE = /\s*<(this message was edited|تم تعديل هذه الرسالة|se editó este mensaje|ce message a été modifié|diese nachricht wurde bearbeitet)>\s*$/i;

function classify(body: string, marked: boolean): MessageKind {
  const t = body.trim();
  if (DELETED_RE.test(t)) return "unsent";
  if (MEDIA_RE.test(t)) return "media";
  if (CALL_RE.test(t)) return "call";
  if (LOCATION_RE.test(t)) return "share";
  if (marked && t.length < 200) {
    // iPhone marks media/system lines; real text is never marked.
    return /omitted|attached|‎?<|\.(jpe?g|mp4|opus|pdf)/i.test(t) ? "media" : "system";
  }
  return "text";
}

/** "WhatsApp Chat with John Smith.txt", "WhatsApp Chat - John Smith.zip", "دردشة واتساب مع …" → "John Smith". */
export function titleFromFileName(path: string): string | null {
  const base = path.split(/[\\/]/).pop() ?? "";
  const noExt = base.replace(/\.(txt|zip)$/i, "");
  const m =
    /^whatsapp chat (?:with|-|–)\s*(.+)$/i.exec(noExt) ??
    /^(?:دردشة|محادثة) واتساب مع\s*(.+)$/.exec(noExt) ??
    /^(?:chat de whatsapp con|discussion whatsapp avec|whatsapp-chat mit)\s*(.+)$/i.exec(noExt);
  return m?.[1]?.trim() ?? null;
}

export interface WhatsAppOptions {
  /** Minutes east of UTC of the phone that exported the chat (Dubai = 240). */
  timeZoneOffsetMinutes?: number;
  /** Used only when the dates in the file cannot decide it. */
  fallbackDateOrder?: "dmy" | "mdy";
  title?: string;
}

export function parseWhatsApp(
  text: string,
  path: string,
  opts: WhatsAppOptions = {},
): { part: ThreadPart; ambiguousDates: boolean } {
  const lines = text.split(/\r\n|\r|\n/);
  const entries: { head: Header; body: string }[] = [];
  for (const line of lines) {
    const head = readHeader(line);
    if (head) {
      entries.push({ head, body: head.rest });
    } else if (entries.length) {
      entries[entries.length - 1]!.body += "\n" + stripInvisible(line);
    }
  }

  const { order, ambiguous } = inferDateOrder(
    entries.map((e) => e.head),
    opts.fallbackDateOrder ?? "dmy",
  );
  const offset = (opts.timeZoneOffsetMinutes ?? 0) * 60_000;
  const messages: RawMessage[] = [];
  const senders = new Set<string>();

  for (const { head, body } of entries) {
    let y: number, mo: number, d: number;
    if (order === "ymd") [y, mo, d] = [head.a, head.b, head.c];
    else if (order === "dmy") [d, mo, y] = [head.a, head.b, head.c];
    else [mo, d, y] = [head.a, head.b, head.c];
    if (y < 100) y += 2000;
    let h = head.h;
    if (head.ampm) {
      const pm = /^[Pp]|^م$/.test(head.ampm.trim());
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
    }
    const at = Date.UTC(y, mo - 1, d, h, head.mi, head.s) - offset;

    // "Sender: message". System lines have no sender.
    const sep = body.indexOf(": ");
    let sender: string | null = null;
    let msg = body;
    if (sep > 0 && sep <= 80 && !body.slice(0, sep).includes("\n")) {
      sender = body.slice(0, sep).trim();
      msg = body.slice(sep + 2);
    }
    msg = msg.replace(EDITED_RE, "");
    // System lines ("John added Mary", the encryption notice) have no "Name: ".
    // iPhone writes the encryption notice under the chat name, marked with U+200E.
    const kind: MessageKind = sender ? classify(msg, head.marked) : "system";
    if (sender && kind === "system" && ENCRYPTION_NOTICE_RE.test(msg)) sender = null;
    if (sender) senders.add(sender);
    messages.push({ sender, at, text: msg.trim(), kind });
  }

  const named = opts.title ?? titleFromFileName(path) ?? undefined;
  const title = named ?? [...senders].join(", ");
  return {
    part: {
      channel: "whatsapp",
      threadKey: `whatsapp:${nameKey(title)}`,
      title,
      participants: [...senders],
      counterpart: named,
      messages,
    },
    ambiguousDates: ambiguous && entries.length > 0,
  };
}
