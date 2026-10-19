import { strToU8, zipSync } from "fflate";

/** All chats in these tests are made up. Never put real exports in this repo. */

/** Encode text the way Meta's export does: UTF-8 bytes written as Latin-1 characters. */
export function metaEncode(s: string): string {
  return String.fromCharCode(...new TextEncoder().encode(s));
}

export function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) entries[k] = typeof v === "string" ? strToU8(v) : v;
  return zipSync(entries, { level: 6 });
}

export const DAY = 86_400_000;
export const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);

export function metaThread(opts: {
  me: string;
  them: string;
  messages: [who: "me" | "them", daysAgo: number, content?: string, extra?: Record<string, unknown>][];
  threadPath?: string;
}): string {
  return JSON.stringify({
    participants: [{ name: metaEncode(opts.them) }, { name: metaEncode(opts.me) }],
    // Meta writes newest first.
    messages: [...opts.messages]
      .sort((a, b) => a[1] - b[1])
      .map(([who, daysAgo, content, extra]) => ({
        sender_name: metaEncode(who === "me" ? opts.me : opts.them),
        timestamp_ms: NOW - daysAgo * DAY,
        ...(content !== undefined ? { content: metaEncode(content) } : {}),
        ...(extra ?? {}),
      })),
    title: metaEncode(opts.them),
    is_still_participant: true,
    thread_path: opts.threadPath,
  });
}
