"use client";

import { buildBriefRequest, type Brief } from "../ai/brief";
import type { Verdict } from "../dormancy";
import type { Lead } from "../types";

/**
 * Outcomes (contacted, replied…) are remembered on this device only, keyed by
 * lead id. They hold no chat content. Accounts and syncing come later.
 */
const KEY = "lr.outcomes.v1";

export function loadOutcomes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveOutcome(leadId: string, outcome: string | null): Record<string, string> {
  const all = loadOutcomes();
  if (outcome) all[leadId] = outcome;
  else delete all[leadId];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the choice still shows for this session
  }
  return all;
}

export type BriefState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; brief: Brief }
  | { status: "error"; reason: "not_connected" | "rate_limited" | "failed" };

/** Ask the server to read one lead. Only that lead's trimmed transcript is sent. */
export async function fetchBrief(lead: Lead, verdict: Verdict): Promise<BriefState> {
  const req = buildBriefRequest(lead, verdict);
  if (!req.lines.length) return { status: "error", reason: "failed" };
  try {
    const res = await fetch("/api/read-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status === 503) return { status: "error", reason: "not_connected" };
    if (res.status === 429) return { status: "error", reason: "rate_limited" };
    if (!res.ok) return { status: "error", reason: "failed" };
    const data = (await res.json()) as { brief: Brief };
    return { status: "done", brief: data.brief };
  } catch {
    return { status: "error", reason: "failed" };
  }
}

/** Run tasks with a small concurrency limit. */
export async function pool<T>(items: T[], size: number, run: (item: T) => Promise<boolean>): Promise<void> {
  let i = 0;
  let stop = false;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (!stop && i < items.length) {
      const item = items[i++]!;
      const ok = await run(item);
      if (!ok) stop = true;
    }
  });
  await Promise.all(workers);
}

/**
 * "Delete everything": removes all this app keeps in this browser (outcomes,
 * settings). The chats themselves were never saved anywhere: they lived only
 * in the open page, which the caller resets. When accounts exist this will
 * also call the server's delete endpoint (LeadStore.deleteEverything).
 */
export function clearAllLocalData(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("lr.")) localStorage.removeItem(k);
  } catch {
    // storage blocked: nothing was saved there
  }
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("lr.")) sessionStorage.removeItem(k);
  } catch {
    // same
  }
}
