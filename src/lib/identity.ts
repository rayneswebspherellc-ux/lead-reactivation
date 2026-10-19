import type { Channel, Conversation, Lead } from "./types";

/**
 * One lead may have talked to the agent on several platforms. We only join
 * conversations on hard evidence: the same phone number, email or LinkedIn
 * profile. Matching names alone is not enough (two different "Ahmed"s).
 */
export function mergeIntoLeads(conversations: Conversation[]): Lead[] {
  const parent = conversations.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const owner = new Map<string, number>();
  conversations.forEach((c, i) => {
    if (c.isGroup) return;
    const keys = [
      ...c.phones.map((p) => `p:${p.replace(/^\+/, "")}`),
      ...c.emails.map((e) => `e:${e}`),
      ...(c.profileUrl ? [`u:${c.profileUrl.toLowerCase().replace(/\/$/, "")}`] : []),
    ];
    for (const k of keys) {
      const prev = owner.get(k);
      if (prev === undefined) owner.set(k, i);
      else union(prev, i);
    }
  });

  const groups = new Map<number, Conversation[]>();
  conversations.forEach((c, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(c);
    groups.set(r, g);
  });

  return [...groups.values()].map((convs) => {
    const named = [...convs].sort((a, b) => b.leadTextCount - a.leadTextCount);
    const name =
      named.find((c) => !/^[+\d\s().-]+$/.test(c.leadName))?.leadName ?? named[0]!.leadName;
    return {
      id: `lead:${convs.map((c) => c.id).sort()[0]}`,
      name,
      conversations: convs,
      phones: [...new Set(convs.flatMap((c) => c.phones))],
      emails: [...new Set(convs.flatMap((c) => c.emails))],
      channels: [...new Set(convs.map((c) => c.channel))] as Channel[],
    };
  });
}
