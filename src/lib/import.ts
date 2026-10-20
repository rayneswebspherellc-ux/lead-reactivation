import { ThreadAccumulator } from "./accumulator";
import { chunks, isZip, readZip, concat, type ByteSource } from "./archive";
import { mergeIntoLeads } from "./identity";
import { findGenericThreads } from "./parsers/generic-json";
import { looksLikeLinkedInMessages, parseLinkedInMessages } from "./parsers/linkedin";
import { channelFromPath, looksLikeMetaThread, parseMetaThread } from "./parsers/meta";
import { looksLikeMetaHtml, parseMetaHtml } from "./parsers/meta-html";
import { looksLikeTelegram, parseTelegram } from "./parsers/telegram";
import { findTikTokChats } from "./parsers/tiktok";
import { looksLikeWhatsApp, parseWhatsApp, titleFromFileName } from "./parsers/whatsapp";
import { decodeText, fnv1a, nameKey, normalisePhone } from "./text";
import type {
  Channel,
  Conversation,
  ImportStats,
  ImportWarning,
  Lead,
  Message,
  ThreadPart,
} from "./types";

export interface ImportOptions {
  /** Which platform the files came from, when the file names do not say. */
  channelHint?: Channel;
  /** Agent's time zone, minutes east of UTC (Dubai 240, Bahrain 180, Toronto -240/-300). Used for WhatsApp. */
  timeZoneOffsetMinutes?: number;
  /** WhatsApp date order when the file cannot decide (US phones write month first). */
  fallbackDateOrder?: "dmy" | "mdy";
  /** Largest single text file read from an archive. Default 512 MB. */
  maxFileBytes?: number;
}

export interface FinishOptions {
  /** The agent's own names/handles. Applied to every platform, or per platform. */
  selfNames?: string[] | Partial<Record<Channel, string[]>>;
}

export interface SelfQuestion {
  channel: Channel;
  /** Names to offer the agent: "Which one is you?" */
  candidates: string[];
}

export interface ImportResult {
  conversations: Conversation[];
  leads: Lead[];
  /** Agent's names found per platform. */
  self: Partial<Record<Channel, string[]>>;
  /** Platforms where we could not tell which participant is the agent. */
  needsSelf: SelfQuestion[];
  warnings: ImportWarning[];
  stats: ImportStats;
}

const MAX_NESTED_ZIP = 2;

export class Importer {
  private readonly threads = new Map<string, ThreadAccumulator>();
  private readonly seenFiles = new Set<string>();
  private readonly selfHints = new Map<Channel, Set<string>>();
  private readonly warnings: ImportWarning[] = [];
  private readonly htmlArchives = new Set<string>();
  private readonly partNames = new Map<string, Map<string, number>>();
  private readonly stats: ImportStats = {
    filesSeen: 0,
    filesRead: 0,
    filesSkipped: 0,
    bytesRead: 0,
    threads: 0,
    messages: 0,
  };

  constructor(private readonly opts: ImportOptions = {}) {}

  /** Add one dropped file: a ZIP (any size, read as a stream) or a single .json/.txt/.csv. */
  async addFile(name: string, src: ByteSource): Promise<void> {
    const it = chunks(src);
    const first = await it.next();
    if (first.done) return;
    const head = first.value;
    async function* replay() {
      yield head;
      yield* it;
    }
    if (isZip(head)) {
      await this.addZip(name, replay(), 0);
    } else {
      const parts: Uint8Array[] = [];
      for await (const c of replay()) parts.push(c);
      this.addEntry(name, concat(parts), name, false);
    }
  }

  private async addZip(archive: string, src: AsyncIterable<Uint8Array>, depth: number): Promise<void> {
    const max = this.opts.maxFileBytes ?? 512 * 1024 * 1024;
    for await (const entry of readZip(src, {
      maxEntryBytes: max,
      onSkip: (s) => {
        this.stats.filesSkipped++;
        this.warn(s.reason === "too_large" ? "file_too_large" : "unreadable_file", `${archive}/${s.path}`, s.reason);
      },
    })) {
      const path = `${archive}/${entry.path}`;
      if (/\.zip$/i.test(entry.path)) {
        if (depth < MAX_NESTED_ZIP) await this.addZip(path, chunks(entry.bytes), depth + 1);
        continue;
      }
      this.addEntry(path, entry.bytes, archive, true);
    }
  }

  private warn(code: ImportWarning["code"], file: string | undefined, detail: string) {
    this.warnings.push({ code, file, detail });
  }

  private addEntry(path: string, bytes: Uint8Array, archive: string, inArchive: boolean): void {
    this.stats.filesSeen++;
    const lower = path.toLowerCase();
    // Only conversation pages of an HTML export are chats; the rest (settings,
    // ads, the "your_messages" index…) are skipped quietly.
    if (/\.html?$/.test(lower) && !/(^|\/)message_\d+\.html?$/.test(lower)) return;

    let parts: ThreadPart[] = [];
    try {
      const text = decodeText(bytes);
      if (/\.html?$/.test(lower)) {
        const res = looksLikeMetaHtml(text)
          ? parseMetaHtml(text, path, {
              hint: this.opts.channelHint,
              timeZoneOffsetMinutes: this.opts.timeZoneOffsetMinutes,
            })
          : null;
        if (res) {
          parts = [res.part];
          if (res.owner) this.addSelfHint(res.part.channel, res.owner);
        } else if (!this.htmlArchives.has(archive)) {
          this.htmlArchives.add(archive);
          this.warn(
            "html_export",
            archive,
            "Some conversation pages in this HTML export could not be read. Exporting again as JSON may help.",
          );
        }
      } else if (lower.endsWith(".json")) {
        parts = this.readJson(text, path, inArchive);
      } else if (lower.endsWith(".csv")) {
        if (looksLikeLinkedInMessages(text)) parts = parseLinkedInMessages(text);
      } else if (lower.endsWith(".txt") || !inArchive) {
        if (looksLikeWhatsApp(text)) {
          const { part, ambiguousDates } = parseWhatsApp(text, path, {
            timeZoneOffsetMinutes: this.opts.timeZoneOffsetMinutes,
            fallbackDateOrder: this.opts.fallbackDateOrder,
            title: titleFromFileName(path) ?? titleFromFileName(archive) ?? undefined,
          });
          parts = [part];
          if (ambiguousDates) {
            this.warn(
              "ambiguous_dates",
              path,
              "Could not tell day/month order from this chat's dates; used the default. Check the dates look right.",
            );
          }
        }
      }
    } catch (e) {
      this.stats.filesSkipped++;
      this.warn("unreadable_file", path, e instanceof Error ? e.message : String(e));
      return;
    }

    if (!parts.length) {
      // Most files in a full archive are not chats (likes, ads, settings). Only
      // complain about files dropped on their own.
      if (!inArchive) this.warn("unknown_file", path, "No conversations found in this file.");
      this.stats.filesSkipped++;
      return;
    }
    // An identical chat file again is still read: it belongs to whichever export
    // it came in, and finish() keeps one copy of each chat, so nothing is counted
    // twice. Only chat files are checked, so identical settings files stay quiet.
    const sig = fnv1a(bytes);
    if (this.seenFiles.has(sig)) {
      this.warn("duplicate_file", path, "This file was already added; each chat is counted once.");
    }
    this.seenFiles.add(sig);
    this.stats.filesRead++;
    this.stats.bytesRead += bytes.length;
    // "message_1 (1).json" / "_chat - Copy.txt": a browser or Windows renamed a second copy.
    const fileName = path
      .split("/")
      .pop()!
      .toLowerCase()
      .replace(/\s*(\(\d+\)|- copy(\s*\(\d+\))?)(?=\.[a-z0-9]+$)/, "");
    for (const part of parts) {
      // A chat's files never repeat within one export (message_1, message_2 …).
      // The same file name again for the same chat means a second export.
      let names = this.partNames.get(part.threadKey);
      if (!names) this.partNames.set(part.threadKey, (names = new Map()));
      const generation = names.get(fileName) ?? 0;
      names.set(fileName, generation + 1);
      const key = `${part.threadKey}\u0000${generation}`;
      let acc = this.threads.get(key);
      if (!acc) {
        acc = new ThreadAccumulator(part.channel, part.threadKey);
        this.threads.set(key, acc);
      }
      acc.add(part, path);
    }
  }

  private readJson(text: string, path: string, inArchive: boolean): ThreadPart[] {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Not valid JSON (the file may be cut short).");
    }
    if (looksLikeMetaThread(json)) return [parseMetaThread(json, path, this.opts.channelHint)];
    if (looksLikeTelegram(json)) {
      const { parts, selfName } = parseTelegram(json);
      if (selfName) this.addSelfHint("telegram", selfName);
      return parts;
    }
    const tiktok = findTikTokChats(json);
    if (tiktok.length) return tiktok;
    if (!inArchive || /messag|chat|inbox|conversation|direct/i.test(path)) {
      return findGenericThreads(json, path, channelFromPath(path, this.opts.channelHint));
    }
    return [];
  }

  private addSelfHint(channel: Channel, name: string) {
    let s = this.selfHints.get(channel);
    if (!s) this.selfHints.set(channel, (s = new Set()));
    s.add(nameKey(name));
  }

  /** Build conversations and leads. Can be called again with selfNames after asking the agent. */
  finish(options: FinishOptions = {}): ImportResult {
    // The same chat from two exports (exported again months later): keep the
    // newer export, which already holds the full history.
    const newest = new Map<string, ThreadAccumulator>();
    for (const t of this.threads.values()) {
      const prev = newest.get(t.threadKey);
      if (!prev || t.lastAt > prev.lastAt || (t.lastAt === prev.lastAt && t.total > prev.total)) {
        newest.set(t.threadKey, t);
      }
    }
    const byChannel = new Map<Channel, ThreadAccumulator[]>();
    for (const t of newest.values()) {
      const list = byChannel.get(t.channel) ?? [];
      list.push(t);
      byChannel.set(t.channel, list);
    }

    const self: Partial<Record<Channel, string[]>> = {};
    const needsSelf: SelfQuestion[] = [];
    const selfKeys = new Map<Channel, Set<string>>();

    for (const [channel, threads] of byChannel) {
      const given = Array.isArray(options.selfNames)
        ? options.selfNames
        : options.selfNames?.[channel];
      let keys = new Set<string>(given?.map(nameKey) ?? []);
      for (const k of this.selfHints.get(channel) ?? []) keys.add(k);
      if (!keys.size) keys = detectSelf(threads);
      // Names given for other platforms only count where they actually appear.
      const present = new Set(threads.flatMap((t) => [...t.participants.keys()]));
      keys = new Set([...keys].filter((k) => present.has(k)));
      if (keys.size) {
        selfKeys.set(channel, keys);
        self[channel] = [...keys].map((k) => displayName(threads, k));
      } else {
        needsSelf.push({ channel, candidates: candidates(threads) });
      }
    }
    for (const q of needsSelf) {
      this.warn(
        "self_unknown",
        undefined,
        `Could not tell which ${q.channel} participant is you. Choose your name to continue.`,
      );
    }

    const conversations: Conversation[] = [];
    for (const t of newest.values()) {
      conversations.push(buildConversation(t, selfKeys.get(t.channel)));
    }
    const warnings = dedupeWarnings(this.warnings);
    return {
      conversations,
      leads: mergeIntoLeads(conversations),
      self,
      needsSelf,
      warnings,
      stats: {
        ...this.stats,
        threads: newest.size,
        messages: [...newest.values()].reduce((n, t) => n + t.total, 0),
      },
    };
  }
}

/**
 * Who is the agent?
 * 1. Chats named after the other person (WhatsApp file names, TikTok, Meta
 *    1:1 titles): whoever else wrote in them is the agent. Works from one chat.
 * 2. Otherwise: the one person who appears in most of the conversations.
 */
function detectSelf(threads: ThreadAccumulator[]): Set<string> {
  const votes = new Map<string, number>();
  let voted = 0;
  for (const t of threads) {
    if (!t.counterpart || !t.participants.has(t.counterpart)) continue;
    const others = [...t.participants.keys()].filter((k) => k !== t.counterpart);
    if (others.length !== 1) continue;
    votes.set(others[0]!, (votes.get(others[0]!) ?? 0) + 1);
    voted++;
  }
  if (voted) {
    const [best, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (n >= voted * 0.6) return new Set([best]);
  }
  if (threads.length < 2) return new Set();
  const counts = new Map<string, number>();
  for (const t of threads) for (const k of t.participants.keys()) counts.set(k, (counts.get(k) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top || top[1] < 2 || top[1] < threads.length * 0.5) return new Set();
  const second = sorted[1];
  // Two names equally everywhere (e.g. two chats with the same two people): cannot tell.
  if (second && second[1] === top[1] && threads.length <= 2) return new Set();
  return new Set(sorted.filter(([, c]) => c === top[1]).map(([k]) => k));
}

function candidates(threads: ThreadAccumulator[]): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const t of threads) {
    for (const [k, name] of t.participants) {
      const c = counts.get(k) ?? { name, n: 0 };
      c.n += (t.senders.get(k)?.total ?? 0) + 1;
      counts.set(k, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((c) => c.name);
}

function displayName(threads: ThreadAccumulator[], key: string): string {
  for (const t of threads) {
    const n = t.participants.get(key);
    if (n) return n;
  }
  return key;
}

function buildConversation(t: ThreadAccumulator, selfKeys: Set<string> | undefined): Conversation {
  const isSelf = (k: string) => selfKeys?.has(k) ?? false;
  const others = [...t.participants.entries()].filter(([k]) => !isSelf(k));
  const isGroup = others.length > 1;
  const leadName = others.length === 1 ? others[0]![1] : t.title || others.map(([, n]) => n).join(", ");

  let leadText = 0;
  let agentText = 0;
  let lastLeadAt: number | null = null;
  let lastAgentAt: number | null = null;
  let lastLeadTextAt: number | null = null;
  let lastAgentTextAt: number | null = null;
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const [k, s] of t.senders) {
    if (isSelf(k)) {
      agentText += s.text;
      lastAgentAt = Math.max(lastAgentAt ?? -Infinity, s.lastAt);
      if (s.lastTextAt !== null) lastAgentTextAt = Math.max(lastAgentTextAt ?? -Infinity, s.lastTextAt);
    } else {
      leadText += s.text;
      lastLeadAt = Math.max(lastLeadAt ?? -Infinity, s.lastAt);
      if (s.lastTextAt !== null) lastLeadTextAt = Math.max(lastLeadTextAt ?? -Infinity, s.lastTextAt);
      for (const p of s.phones) phones.add(p);
      for (const e of s.emails) emails.add(e);
    }
  }
  // WhatsApp chats with unsaved numbers are titled with the number itself.
  if (t.channel === "whatsapp" && !isGroup) {
    const p = normalisePhone(leadName);
    if (p && /^[+\d\s().-]+$/.test(leadName)) phones.add(p);
  }
  const selfKnown = selfKeys !== undefined;
  const lastTextFrom: Conversation["lastTextFrom"] = !selfKnown
    ? null
    : lastLeadTextAt === null && lastAgentTextAt === null
      ? null
      : (lastLeadTextAt ?? -Infinity) >= (lastAgentTextAt ?? -Infinity)
        ? "lead"
        : "agent";

  const excerpt: Message[] = t.excerpt().map((m) => ({
    at: m.at,
    sender: m.sender,
    text: m.text,
    kind: m.kind,
    from: m.sender === null ? "system" : isSelf(nameKey(m.sender)) ? "agent" : "lead",
  }));

  const leadKey = others.length === 1 ? others[0]![0] : undefined;
  return {
    id: `${t.channel}:${hashId(t.threadKey)}`,
    channel: t.channel,
    title: t.title,
    leadName,
    participants: [...t.participants.values()],
    isGroup,
    folder: t.folder,
    profileUrl: leadKey ? t.profileUrls.get(leadKey) : undefined,
    sources: [...t.sources],
    messageCount: t.total,
    leadTextCount: selfKnown ? leadText : 0,
    agentTextCount: agentText,
    firstAt: t.firstAt,
    lastAt: t.lastAt,
    lastLeadAt: selfKnown ? lastLeadAt : null,
    lastAgentAt: selfKnown ? lastAgentAt : null,
    lastTextFrom,
    selfKnown,
    excerpt,
    phones: [...phones],
    emails: [...emails],
  };
}

function hashId(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function dedupeWarnings(list: ImportWarning[]): ImportWarning[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const k = `${w.code}|${w.file ?? ""}|${w.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
