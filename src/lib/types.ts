export type Channel =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "linkedin"
  | "telegram"
  | "tiktok"
  | "other";

/**
 * What a message is. Only "text" carries real conversation; the rest are
 * kept so the timeline is complete, but never count as the lead "talking".
 */
export type MessageKind =
  | "text"
  | "media"
  | "reaction"
  | "call"
  | "share"
  | "story_reply"
  | "system"
  | "unsent";

/** A message as read from a file, before we know who the agent is. */
export interface RawMessage {
  /** Display name, handle or phone exactly as the export shows it. null for system lines. */
  sender: string | null;
  /** Epoch milliseconds. WhatsApp exports have no time zone; see ImportOptions.timeZoneOffsetMinutes. */
  at: number;
  text: string;
  kind: MessageKind;
}

/** One conversation (or one part of it) found in one file. */
export interface ThreadPart {
  channel: Channel;
  /** Stable key so parts from several files (message_1.json, message_2.json, split ZIPs) join up. */
  threadKey: string;
  title: string;
  participants: string[];
  /** Platform folder, e.g. inbox, message_requests, archived_threads, SPAM. */
  folder?: string;
  /**
   * The other person, when the export names the chat after them (WhatsApp file
   * name, TikTok "Chat History with X", Instagram/Facebook 1:1 title). Lets us
   * tell who the agent is even from a single chat.
   */
  counterpart?: string;
  /** Profile URL per sender name, when the export has it (LinkedIn). */
  profileUrls?: Record<string, string>;
  messages: RawMessage[];
}

export type Direction = "lead" | "agent" | "system";

export interface Message {
  at: number;
  from: Direction;
  sender: string | null;
  text: string;
  kind: MessageKind;
}

export interface Conversation {
  id: string;
  channel: Channel;
  title: string;
  /** Best name for the other person. */
  leadName: string;
  participants: string[];
  isGroup: boolean;
  folder?: string;
  profileUrl?: string;
  /** Files this conversation was read from. */
  sources: string[];
  messageCount: number;
  leadTextCount: number;
  agentTextCount: number;
  firstAt: number;
  lastAt: number;
  lastLeadAt: number | null;
  lastAgentAt: number | null;
  /** Who sent the last real (text) message. */
  lastTextFrom: "lead" | "agent" | null;
  /** False until we know which participant is the agent; directions are then unknown. */
  selfKnown: boolean;
  /** Earliest and latest messages, in time order. The middle of very long chats is counted but not kept. */
  excerpt: Message[];
  /** Phone numbers and emails the lead wrote in the chat, normalised. */
  phones: string[];
  emails: string[];
}

export interface Lead {
  id: string;
  name: string;
  conversations: Conversation[];
  phones: string[];
  emails: string[];
  channels: Channel[];
}

export interface ImportWarning {
  code:
    | "html_export"
    | "unknown_file"
    | "unreadable_file"
    | "file_too_large"
    | "ambiguous_dates"
    | "self_unknown"
    | "duplicate_file"
    | "e2ee_missing_hint";
  file?: string;
  detail: string;
}

export interface ImportStats {
  filesSeen: number;
  filesRead: number;
  filesSkipped: number;
  bytesRead: number;
  threads: number;
  messages: number;
}
