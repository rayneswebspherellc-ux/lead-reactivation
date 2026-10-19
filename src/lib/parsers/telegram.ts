import type { MessageKind, RawMessage, ThreadPart } from "../types";

/**
 * Telegram Desktop → Export chat history, "Machine-readable JSON" → result.json.
 * Either one chat ({ name, type, id, messages }) or the whole account
 * ({ personal_information, chats: { list: [...] } }). Message text is a string
 * or an array of strings and { type, text } entities.
 */

interface TgMessage {
  type?: string;
  date?: string;
  date_unixtime?: string;
  from?: string | null;
  text?: string | (string | { text?: string })[];
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
  action?: string;
}

interface TgChat {
  name?: string;
  type?: string;
  id?: number | string;
  messages?: TgMessage[];
}

interface TgExport extends TgChat {
  personal_information?: { first_name?: string; last_name?: string; username?: string };
  chats?: { list?: TgChat[] };
}

export function looksLikeTelegram(json: unknown): json is TgExport {
  if (!json || typeof json !== "object") return false;
  const j = json as TgExport;
  if (Array.isArray(j.chats?.list)) return true;
  return (
    Array.isArray(j.messages) &&
    typeof j.type === "string" &&
    j.messages.some((m) => m && typeof m === "object" && ("date_unixtime" in m || "from_id" in m))
  );
}

function textOf(t: TgMessage["text"]): string {
  if (typeof t === "string") return t;
  if (!Array.isArray(t)) return "";
  return t.map((p) => (typeof p === "string" ? p : (p.text ?? ""))).join("");
}

function chatToPart(chat: TgChat): ThreadPart | null {
  if (!Array.isArray(chat.messages)) return null;
  if (chat.type === "saved_messages" || chat.type?.endsWith("channel")) return null;
  const messages: RawMessage[] = [];
  const senders = new Set<string>();
  for (const m of chat.messages) {
    const at = m.date_unixtime ? Number(m.date_unixtime) * 1000 : Date.parse(m.date ?? "");
    if (Number.isNaN(at)) continue;
    const text = textOf(m.text).trim();
    let kind: MessageKind = "text";
    if (m.type === "service" || m.action) kind = "system";
    else if (!text) kind = m.photo || m.file || m.media_type || m.sticker_emoji ? "media" : "system";
    const sender = m.from ?? null;
    if (sender && kind !== "system") senders.add(sender);
    messages.push({ sender: kind === "system" ? null : sender, at, text, kind });
  }
  const name = chat.name ?? [...senders].join(", ");
  return {
    channel: "telegram",
    threadKey: `telegram:${chat.id ?? name}`,
    title: name,
    participants: [...senders],
    folder: chat.type,
    messages,
  };
}

export function parseTelegram(json: TgExport): { parts: ThreadPart[]; selfName?: string } {
  const chats = json.chats?.list ?? [json];
  const me = json.personal_information;
  const selfName = me
    ? [me.first_name, me.last_name].filter(Boolean).join(" ").trim() || undefined
    : undefined;
  return {
    parts: chats.map(chatToPart).filter((p): p is ThreadPart => p !== null),
    selfName,
  };
}
