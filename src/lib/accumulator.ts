import { extractEmails, extractPhones, nameKey } from "./text";
import type { Channel, RawMessage, ThreadPart } from "./types";

/**
 * Collects one conversation from one export (all its files, e.g. message_1,
 * message_2 … across split ZIPs), with bounded memory: every message is
 * counted, but only the first HEAD and last TAIL messages are kept as text.
 * A chat with a million messages costs the same memory as one with a hundred.
 * When the same chat comes from two exports, the importer keeps the newer one.
 */

export const HEAD = 6;
export const TAIL = 60;

export interface SenderStats {
  name: string;
  total: number;
  text: number;
  firstAt: number;
  lastAt: number;
  lastTextAt: number | null;
  phones: Set<string>;
  emails: Set<string>;
}

function same(a: RawMessage, b: RawMessage): boolean {
  return a.at === b.at && a.sender === b.sender && a.text === b.text;
}

export class ThreadAccumulator {
  readonly channel: Channel;
  readonly threadKey: string;
  title = "";
  folder?: string;
  /** nameKey of the other person, when the export names the chat after them. */
  counterpart?: string;
  readonly participants = new Map<string, string>(); // key → display name
  readonly profileUrls = new Map<string, string>(); // key → url
  readonly sources = new Set<string>();
  readonly senders = new Map<string, SenderStats>(); // key → stats
  total = 0;
  firstAt = Infinity;
  lastAt = -Infinity;
  readonly head: RawMessage[] = [];
  readonly tail: RawMessage[] = [];

  constructor(channel: Channel, threadKey: string) {
    this.channel = channel;
    this.threadKey = threadKey;
  }

  add(part: ThreadPart, source: string): number {
    this.sources.add(source);
    if (!this.title || this.title === [...this.participants.values()].join(", ")) {
      this.title = part.title || this.title;
    }
    if (part.folder && !this.folder) this.folder = part.folder;
    if (part.counterpart && !this.counterpart) this.counterpart = nameKey(part.counterpart);
    for (const p of part.participants) this.participants.set(nameKey(p), p);
    for (const [name, url] of Object.entries(part.profileUrls ?? {})) {
      this.profileUrls.set(nameKey(name), url);
    }
    let added = 0;
    for (const m of part.messages) if (this.push(m)) added++;
    return added;
  }

  private push(m: RawMessage): boolean {
    this.total++;
    if (m.at < this.firstAt) this.firstAt = m.at;
    if (m.at > this.lastAt) this.lastAt = m.at;

    if (m.sender) {
      const key = nameKey(m.sender);
      if (!this.participants.has(key)) this.participants.set(key, m.sender);
      let s = this.senders.get(key);
      if (!s) {
        s = {
          name: m.sender,
          total: 0,
          text: 0,
          firstAt: m.at,
          lastAt: m.at,
          lastTextAt: null,
          phones: new Set(),
          emails: new Set(),
        };
        this.senders.set(key, s);
      }
      s.total++;
      if (m.at < s.firstAt) s.firstAt = m.at;
      if (m.at > s.lastAt) s.lastAt = m.at;
      if (m.kind === "text") {
        s.text++;
        if (s.lastTextAt === null || m.at > s.lastTextAt) s.lastTextAt = m.at;
        if (/\d{3}|@/.test(m.text)) {
          for (const p of extractPhones(m.text)) s.phones.add(p);
          for (const e of extractEmails(m.text)) s.emails.add(e);
        }
      }
    }

    // Keep the latest TAIL messages (sorted ascending).
    if (this.tail.length < TAIL || m.at > this.tail[0]!.at) {
      if (insertSorted(this.tail, m) && this.tail.length > TAIL) this.tail.shift();
    }
    // Keep the earliest HEAD messages.
    if (this.head.length < HEAD || m.at < this.head[this.head.length - 1]!.at) {
      if (insertSorted(this.head, m) && this.head.length > HEAD) this.head.pop();
    }
    return true;
  }

  /** Earliest + latest messages without overlap, in time order. */
  excerpt(): RawMessage[] {
    const out = [...this.head];
    for (const m of this.tail) if (!out.some((x) => same(x, m))) out.push(m);
    return out.sort((a, b) => a.at - b.at);
  }
}

/** Insert in time order; skips an identical message already kept. */
function insertSorted(arr: RawMessage[], m: RawMessage): boolean {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.at <= m.at) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0 && arr[i]!.at === m.at; i--) if (same(arr[i]!, m)) return false;
  arr.splice(lo, 0, m);
  return true;
}
