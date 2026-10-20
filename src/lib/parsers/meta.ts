import { fixMojibake } from "../text";
import type { Channel, MessageKind, RawMessage, ThreadPart } from "../types";

/**
 * Instagram and Facebook Messenger "Download your information" JSON.
 * One folder per conversation (…/messages/inbox/<name>_<id>/), messages in
 * message_1.json, message_2.json … (message_1 holds the newest). Text is
 * mojibake-encoded; timestamps are epoch milliseconds (UTC).
 */

export interface MetaMessage {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
  type?: string;
  is_unsent?: boolean;
  call_duration?: number;
  photos?: unknown[];
  videos?: unknown[];
  audio_files?: unknown[];
  gifs?: unknown[];
  files?: unknown[];
  sticker?: unknown;
  share?: { link?: string; share_text?: string };
}

interface MetaThread {
  participants?: { name?: string }[];
  messages?: MetaMessage[];
  title?: string;
  thread_path?: string;
}

export function looksLikeMetaThread(json: unknown): json is MetaThread {
  if (!json || typeof json !== "object") return false;
  const t = json as MetaThread;
  return (
    Array.isArray(t.participants) &&
    Array.isArray(t.messages) &&
    (t.messages.length === 0 ||
      t.messages.some((m) => m && typeof m === "object" && "timestamp_ms" in m))
  );
}

const FOLDERS = [
  "inbox",
  "message_requests",
  "filtered_threads",
  "archived_threads",
  "e2ee_cutover",
  // Seen in a real Facebook export (Oct 2026): archived chats moved to encryption.
  "e2ee_cutover_archived",
];

// English platform phrases (exports are written in the account's language;
// other languages fall through as text and are judged later by the AI).
const REACTION_RE =
  /^(liked a message|.{0,80}reacted .{1,16} to (your|a|their) message\.?|reacted .{1,16} to your message\.?)$/i;
const ATTACHMENT_RE = /^(you|.{1,80}) sent an attachment\.?$/i;
const STORY_RE =
  /^(replied to your story|.{0,80}replied to your story\.?|mentioned you in their story|you replied to their story|.{0,80} mentioned you in (their|a) story)\.?$/i;
const CALL_RE =
  /^(you missed a call from .+|.{1,80} missed your call\.?|the video chat ended\.?|the call ended\.?|.{1,80} started a (video|audio) call\.?)$/i;
// Only Facebook's exact event lines. Loose patterns such as "… left …" would
// swallow real messages ("I left you a voicemail"), hiding real leads.
const SYSTEM_RE = new RegExp(
  "^(" +
    [
      "you are now connected on messenger",
      "you're now connected on messenger",
      "you can now (message|call) each other.*",
      "you can now message and call each other.*",
      "say hi to your new facebook friend.*",
      "a contact (added participants|added you to the group|created the group chat|left the group|removed .{1,80} from the group)",
      ".{1,80} added .{1,80} to the group",
      ".{1,80} removed .{1,80} from the group",
      ".{1,80} left the group",
      ".{1,80} created the group",
      "(you|.{1,80}) (named|renamed) the (group|chat).*",
      "(you|.{1,80}) changed the (group photo|group name|chat theme|theme|emoji|chat emoji).*",
      "(you|.{1,80}) set (the|your|their|his|her) nickname.*",
      "(you|.{1,80}) set the nickname for .*",
      "(you|.{1,80}) (set|changed) the quick reaction.*",
      "this message was unsent",
      "(you|.{1,80}) unsent a message",
      "(you|.{1,80}) (pinned|unpinned) a message",
    ].join("|") +
    ")\\.?$",
  "i",
);

export function classify(m: MetaMessage, text: string): MessageKind {
  if (m.is_unsent) return "unsent";
  if (m.type === "Call" || typeof m.call_duration === "number") return "call";
  if (m.type === "Subscribe" || m.type === "Unsubscribe") return "system";
  if (!text) {
    if (m.share) return "share";
    if (m.photos || m.videos || m.audio_files || m.gifs || m.files || m.sticker) return "media";
    return "system";
  }
  // HTML exports write deleted messages as words instead of an is_unsent flag.
  if (/^(this message was unsent|(you|.{1,80}) unsent a message)\.?$/i.test(text)) return "unsent";
  if (REACTION_RE.test(text)) return "reaction";
  if (STORY_RE.test(text)) return "story_reply";
  if (CALL_RE.test(text)) return "call";
  if (SYSTEM_RE.test(text)) return "system";
  if (ATTACHMENT_RE.test(text)) return "media";
  if (m.share?.link && text.trim() === m.share.link.trim()) return "share";
  return "text";
}

export function channelFromPath(path: string, hint?: Channel): Channel {
  const p = path.toLowerCase();
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook") || p.includes("messenger")) return "facebook";
  return hint ?? "other";
}

/** Thread folder and platform folder (inbox, message_requests…) from the file path or thread_path. */
export function locate(path: string, threadPath?: string): { key?: string; folder?: string } {
  const segs = (threadPath ?? path).split(/[\\/]/).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]!.toLowerCase();
    if (FOLDERS.includes(s) && segs[i + 1]) {
      return { key: segs[i + 1], folder: s };
    }
  }
  // thread_path like "inbox/john_123" without the folder list match
  if (threadPath && segs.length >= 2) return { key: segs[segs.length - 1], folder: segs[0] };
  return {};
}

export function parseMetaThread(
  json: MetaThread,
  path: string,
  hint?: Channel,
): ThreadPart {
  const channel = channelFromPath(path, hint);
  const participants = (json.participants ?? [])
    .map((p) => fixMojibake(p.name ?? "").trim())
    .filter(Boolean);
  const title = fixMojibake(json.title ?? "").trim() || participants.join(", ");
  const { key, folder } = locate(path, json.thread_path);
  const messages: RawMessage[] = [];
  for (const m of json.messages ?? []) {
    if (!m || typeof m.timestamp_ms !== "number") continue;
    const text = fixMojibake(m.content ?? "").trim();
    messages.push({
      sender: m.sender_name ? fixMojibake(m.sender_name).trim() : null,
      at: m.timestamp_ms,
      text,
      kind: classify(m, text),
    });
  }
  return {
    channel,
    threadKey: `${channel}:${key ?? `${title}|${[...participants].sort().join("|")}`}`,
    title,
    participants,
    folder,
    counterpart: participants.length === 2 && participants.includes(title) ? title : undefined,
    messages,
  };
}
