import { fixMojibake } from "../text";
import type { Channel, RawMessage, ThreadPart } from "../types";

/**
 * Last resort for JSON we do not recognise (a changed Meta layout, the
 * Messenger end-to-end-encrypted download, other apps): find any array of
 * objects that look like messages (a sender, a time and some text) and read
 * each as one conversation.
 */

const SENDER = ["sender_name", "sendername", "sender", "from", "author", "user", "name"];
const TIME = ["timestamp_ms", "timestampms", "timestamp", "date_unixtime", "date", "time", "created_at", "sent_at"];
const TEXT = ["content", "text", "body", "message", "msg"];

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const real = lower.get(k);
    if (real !== undefined && o[real] != null) return o[real];
  }
  return undefined;
}

function toMs(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    if (/^\d{9,13}$/.test(v)) return toMs(Number(v));
    return Date.parse(v);
  }
  return NaN;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(asText).join("");
  if (v && typeof v === "object" && "text" in v) return asText((v as { text: unknown }).text);
  return "";
}

function asName(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") {
    const n = pick(v as Record<string, unknown>, ["name", "display_name", "username"]);
    return typeof n === "string" ? n.trim() || null : null;
  }
  return null;
}

function messageLike(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return pick(o, TIME) !== undefined && (pick(o, SENDER) !== undefined || pick(o, TEXT) !== undefined);
}

export function findGenericThreads(json: unknown, path: string, channel: Channel): ThreadPart[] {
  const out: ThreadPart[] = [];
  const walk = (node: unknown, parent: Record<string, unknown> | null, depth: number, keyPath: string) => {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) {
      const sample = node.slice(0, 50);
      if (sample.length && sample.filter(messageLike).length >= sample.length * 0.6) {
        const messages: RawMessage[] = [];
        const senders = new Set<string>();
        for (const x of node) {
          if (!messageLike(x)) continue;
          const o = x as Record<string, unknown>;
          const at = toMs(pick(o, TIME));
          if (Number.isNaN(at)) continue;
          const sender = asName(pick(o, SENDER));
          const text = fixMojibake(asText(pick(o, TEXT))).trim();
          if (sender) senders.add(fixMojibake(sender));
          messages.push({ sender: sender ? fixMojibake(sender) : null, at, text, kind: text ? "text" : "media" });
        }
        if (messages.length) {
          const t = parent ? pick(parent, ["title", "name", "thread_name", "chat_name"]) : undefined;
          const title = typeof t === "string" ? fixMojibake(t) : [...senders].join(", ");
          out.push({
            channel,
            threadKey: `${channel}:${path}#${keyPath}`,
            title,
            participants: [...senders],
            messages,
          });
        }
        return;
      }
      node.forEach((v, i) => walk(v, parent, depth + 1, `${keyPath}[${i}]`));
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) walk(v, obj, depth + 1, `${keyPath}.${k}`);
  };
  walk(json, null, 0, "$");
  return out;
}
