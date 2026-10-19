import type { Channel, Lead, Message } from "./types";

/**
 * Rule-based dead-lead finder. No AI and no cost: it decides who is worth an
 * AI read, and in what order. It only uses what is in the conversations.
 */

export interface DormancyOptions {
  now: number;
  /** Days without any message before a lead counts as dead. Default 30. */
  quietDays?: number;
}

export type Pattern =
  /** The lead wrote last and never got an answer. */
  | "lead_waiting"
  /** The agent wrote last and the lead went quiet. */
  | "went_quiet";

export type ExcludeReason =
  | "needs_self"
  | "group_only"
  | "lead_never_wrote"
  | "opted_out"
  | "spam_folder";

export interface Verdict {
  leadId: string;
  status: "dead" | "active" | "excluded";
  pattern?: Pattern;
  excludeReason?: ExcludeReason;
  daysSilent: number;
  lastTouchAt: number;
  lastLeadAt: number | null;
  /** Platform of the most recent conversation. */
  channel: Channel;
  /** The lead's last real message, as evidence. */
  lastLeadMessage?: string;
  /** 0 to 100. Ordering hint only; the AI read does the real judging. */
  prescore: number;
  signals: string[];
}

const DAY = 86_400_000;

// The lead asked not to be contacted, or said they are done. Never reactivate.
const OPT_OUT_RE =
  /\b(stop|unsubscribe|not interested|no longer interested|remove me|do not (contact|message|text|call) me|don'?t (contact|message|text|call) me|leave me alone|wrong number)\b|غير مهتم|لا تتصل|لا ترسل|توقف|إلغاء الاشتراك|الغاء الاشتراك|رقم خطأ/i;

// Words that show real estate intent (English and Arabic). Each distinct hit adds a little.
const INTENT_TERMS: [string, RegExp][] = [
  ["buy", /\b(buy|buying|purchase|purchasing)\b|شراء|اشتري/i],
  ["sell", /\b(sell|selling|list my|listing)\b|بيع/i],
  ["rent", /\b(rent|renting|lease|tenancy)\b|إيجار|ايجار|استئجار/i],
  ["budget", /\b(budget|price|cost|how much|asking)\b|ميزانية|سعر|كم/i],
  ["viewing", /\b(viewing|visit|see the (unit|place|property|apartment|villa)|tour)\b|معاينة|زيارة/i],
  ["bedrooms", /\b(\d\s?(bed|br|bhk|bedroom)s?|studio|bedrooms?)\b|غرف|غرفة/i],
  ["property", /\b(villa|apartment|flat|townhouse|penthouse|condo|duplex|plot|land|house|home)\b|شقة|فيلا|أرض|منزل/i],
  ["offplan", /\b(off[- ]?plan|handover|payment plan|launch)\b/i],
  ["finance", /\b(mortgage|pre-?approv\w*|down ?payment|deposit|cash buyer|financ\w*)\b|تمويل|رهن/i],
  ["invest", /\b(invest\w*|roi|yield|rental income|golden visa)\b|استثمار|الإقامة الذهبية/i],
  ["money", /\b(aed|dhs?|bhd|usd|cad|\$\s?\d|\d+\s?(k|m|mn|million))\b|درهم|دينار/i],
  ["timing", /\b(next month|this year|asap|urgent|moving|relocat\w*|when can)\b/i],
];

export function evaluateLead(lead: Lead, opts: DormancyOptions): Verdict {
  const quietDays = opts.quietDays ?? 30;
  const convs = lead.conversations;
  const known = convs.filter((c) => c.selfKnown);
  const latest = [...convs].sort((a, b) => b.lastAt - a.lastAt)[0]!;
  const lastTouchAt = Math.max(...convs.map((c) => c.lastAt));
  const daysSilent = Math.floor((opts.now - lastTouchAt) / DAY);
  const base = {
    leadId: lead.id,
    daysSilent,
    lastTouchAt,
    channel: latest.channel,
    prescore: 0,
    signals: [] as string[],
  };

  if (!known.length) {
    return { ...base, status: "excluded", excludeReason: "needs_self", lastLeadAt: null };
  }
  const oneToOne = known.filter((c) => !c.isGroup);
  if (!oneToOne.length) {
    return { ...base, status: "excluded", excludeReason: "group_only", lastLeadAt: null };
  }
  const lastLeadAt = maxOrNull(oneToOne.map((c) => c.lastLeadAt));
  const leadTexts = oneToOne.reduce((n, c) => n + c.leadTextCount, 0);
  if (leadTexts === 0) {
    return { ...base, status: "excluded", excludeReason: "lead_never_wrote", lastLeadAt };
  }
  if (oneToOne.every((c) => /spam|filtered/i.test(c.folder ?? ""))) {
    return { ...base, status: "excluded", excludeReason: "spam_folder", lastLeadAt };
  }

  const leadMsgs: Message[] = oneToOne
    .flatMap((c) => c.excerpt)
    .filter((m) => m.from === "lead" && m.kind === "text")
    .sort((a, b) => a.at - b.at);
  const lastLeadMessage = leadMsgs[leadMsgs.length - 1]?.text;
  if (lastLeadMessage && OPT_OUT_RE.test(lastLeadMessage)) {
    return {
      ...base,
      status: "excluded",
      excludeReason: "opted_out",
      lastLeadAt,
      lastLeadMessage,
    };
  }

  const latestKnown = [...oneToOne].sort((a, b) => b.lastAt - a.lastAt)[0]!;
  const pattern: Pattern = latestKnown.lastTextFrom === "lead" ? "lead_waiting" : "went_quiet";

  // Prescore: an ordering hint built only from the conversation.
  let score = 0;
  const signals: string[] = [];
  const allLeadText = leadMsgs.map((m) => m.text).join("\n");
  let intent = 0;
  const intentSignals: string[] = [];
  for (const [name, re] of INTENT_TERMS) {
    if (re.test(allLeadText)) {
      intent++;
      intentSignals.push(name);
    }
  }
  // An unanswered lead matters most when they showed real estate intent;
  // an unanswered "thanks for connecting" should not outrank a real buyer.
  if (pattern === "lead_waiting") {
    score += intent > 0 ? 25 : 6;
    signals.push("left without a reply");
  }
  if (lastLeadMessage?.trim().endsWith("?") || lastLeadMessage?.trim().endsWith("؟")) {
    score += 10;
    signals.push("last message was a question");
  }
  score += Math.min(20, leadTexts * 2);
  signals.push(...intentSignals);
  score += Math.min(28, intent * 4);
  if (daysSilent <= 180) score += 15;
  else if (daysSilent <= 365) score += 10;
  else if (daysSilent <= 730) score += 5;
  if (lead.channels.length > 1) {
    score += 5;
    signals.push("several platforms");
  }

  return {
    ...base,
    status: daysSilent >= quietDays ? "dead" : "active",
    pattern,
    lastLeadAt,
    lastLeadMessage,
    prescore: Math.min(100, score),
    signals,
  };
}

/** Every lead judged; dead leads first, highest prescore first. */
export function findDeadLeads(leads: Lead[], opts: DormancyOptions): Verdict[] {
  const order = { dead: 0, active: 1, excluded: 2 } as const;
  return leads
    .map((l) => evaluateLead(l, opts))
    .sort((a, b) => order[a.status] - order[b.status] || b.prescore - a.prescore);
}

function maxOrNull(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}
