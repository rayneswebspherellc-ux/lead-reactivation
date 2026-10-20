import type { ExcludeReason } from "@/lib/dormancy";
import type { Channel } from "@/lib/types";

export const CHANNEL_NAMES: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  tiktok: "TikTok",
  other: "Other",
};

export const EXCLUDE_NAMES: Record<ExcludeReason, string> = {
  needs_self: "We could not tell which name is yours",
  group_only: "Group chats only",
  lead_never_wrote: "They never wrote a real message",
  opted_out: "They asked not to be contacted",
  selling_to_you: "They were selling something to you",
  spam_folder: "In the spam folder",
};

export const OUTCOMES = [
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "viewing", label: "Viewing booked" },
  { id: "closed", label: "Closed" },
  { id: "not_interested", label: "Not interested" },
] as const;

export type OutcomeId = (typeof OUTCOMES)[number]["id"];

export function daysLabel(days: number): string {
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}
