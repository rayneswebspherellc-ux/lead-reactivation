import type { Brief } from "./ai/brief";
import type { Verdict } from "./dormancy";

/**
 * Plain-language priority for the dashboard. Built only from the conversation
 * (rules), refined by the AI read when the agent has run it.
 */

export type Tier = "today" | "week" | "later";

export const TIER_TEXT: Record<Tier, { title: string; line: string }> = {
  today: {
    title: "Contact today",
    line: "These people showed real interest and were left waiting. Start here.",
  },
  week: {
    title: "This week",
    line: "Some interest, worth a friendly message soon.",
  },
  later: {
    title: "When you have time",
    line: "Little to go on. A light check-in is enough.",
  },
};

export function tierOf(v: Verdict, brief?: Brief | null): Tier {
  if (brief) {
    if (brief.doNotContact) return "later";
    if (brief.likelihood >= 70) return "today";
    if (brief.likelihood >= 40) return "week";
    return "later";
  }
  const intent = v.signals.filter((s) => s in INTENT_PLAIN).length;
  if (v.signals.includes("small talk only")) return "later";
  if (v.prescore >= 60 || (v.pattern === "lead_waiting" && intent >= 2)) return "today";
  if (v.prescore >= 35 || intent >= 2) return "week";
  return "later";
}

/** Signal names from the rules, said the way a person would say them. */
const INTENT_PLAIN: Record<string, string> = {
  buy: "wants to buy",
  sell: "wants to sell",
  rent: "wants to rent",
  budget: "talked about price or budget",
  viewing: "asked to see a property",
  bedrooms: "said how many bedrooms",
  property: "said what kind of home",
  offplan: "asked about off-plan",
  finance: "talked about mortgage or payment",
  invest: "is investing",
  money: "mentioned an amount",
  timing: "gave a timeline",
};

const OTHER_PLAIN: Record<string, string> = {
  "left without a reply": "never got your reply",
  "last message was a question": "asked you a question",
  "several platforms": "talked to you on more than one app",
  "small talk only": "only small talk so far",
};

export function plainSignals(v: Verdict, max = 4): string[] {
  const order = ["left without a reply", "last message was a question"];
  const sorted = [...v.signals].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return sorted
    .map((s) => OTHER_PLAIN[s] ?? INTENT_PLAIN[s])
    .filter((s): s is string => Boolean(s))
    .slice(0, max);
}
