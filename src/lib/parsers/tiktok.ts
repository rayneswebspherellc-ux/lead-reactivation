import type { RawMessage, ThreadPart } from "../types";

/**
 * TikTok "Download your data" (JSON) → user_data.json / user_data_tiktok.json.
 * Direct messages sit under a "Direct Message(s)" section as
 *   "Chat History with <name>:": [{ "Date": "...", "From": "...", "Content": "..." }]
 * The nesting has changed between export versions and is not documented, so
 * we search the whole file for that shape instead of a fixed path.
 * UNVERIFIED against a real export: confirm with a sample before relying on it.
 */

const CHAT_KEY = /^chat\s*history\s*with\s+(.+?):?\s*$/i;

function field(o: Record<string, unknown>, name: string): unknown {
  for (const k of Object.keys(o)) if (k.toLowerCase() === name) return o[k];
  return undefined;
}

function isChatArray(v: unknown): v is Record<string, unknown>[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => x && typeof x === "object" && field(x as Record<string, unknown>, "date") !== undefined)
  );
}

export function findTikTokChats(json: unknown): ThreadPart[] {
  const out: ThreadPart[] = [];
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const m = CHAT_KEY.exec(k);
      if (m && isChatArray(v)) {
        const name = m[1]!.trim();
        const messages: RawMessage[] = [];
        const senders = new Set<string>();
        for (const row of v) {
          const date = String(field(row, "date") ?? "");
          // "2023-05-01 12:34:56", assumed UTC (TikTok does not say)
          const at = Date.parse(date.includes("T") ? date : date.replace(" ", "T") + "Z");
          if (Number.isNaN(at)) continue;
          const from = String(field(row, "from") ?? "").trim() || null;
          const text = String(field(row, "content") ?? "").trim();
          if (from) senders.add(from);
          messages.push({ sender: from, at, text, kind: text ? "text" : "media" });
        }
        out.push({
          channel: "tiktok",
          threadKey: `tiktok:${name.toLowerCase()}`,
          title: name,
          participants: [...senders, name].filter((x, i, a) => a.indexOf(x) === i),
          counterpart: name,
          messages,
        });
      } else {
        walk(v, depth + 1);
      }
    }
  };
  walk(json, 0);
  return out;
}
