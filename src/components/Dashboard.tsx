"use client";

import { useMemo, useState } from "react";
import type { Verdict } from "@/lib/dormancy";
import { fetchBrief, loadOutcomes, pool, saveOutcome, type BriefState } from "@/lib/client/store";
import { TIER_TEXT, plainSignals, tierOf, type Tier } from "@/lib/tiers";
import type { Channel, Lead } from "@/lib/types";
import type { Outcome } from "@/workers/import.worker";
import { CHANNEL_NAMES, EXCLUDE_NAMES, OUTCOMES, daysLabel } from "./labels";
import LeadSheet from "./LeadSheet";

const PAGE = 12;
const AI_BATCH = 20;
const TIERS: Tier[] = ["today", "week", "later"];

export default function Dashboard({ outcome, quietDays }: { outcome: Outcome; quietDays: number }) {
  const leadsById = useMemo(() => new Map(outcome.leads.map((l) => [l.id, l])), [outcome.leads]);
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [shown, setShown] = useState<Record<Tier, number>>({ today: PAGE, week: PAGE, later: PAGE });
  const [openId, setOpenId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, BriefState>>({});
  // The dashboard only mounts in the browser (after files are read), so storage is available.
  const [outcomes, setOutcomes] = useState<Record<string, string>>(loadOutcomes);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  const briefOf = (id: string) => {
    const b = briefs[id];
    return b?.status === "done" ? b.brief : null;
  };

  const inChannel = (v: Verdict) => channel === "all" || leadsById.get(v.leadId)!.channels.includes(channel);

  const groups = useMemo(() => {
    const g: Record<Tier, Verdict[]> = { today: [], week: [], later: [] };
    for (const v of outcome.verdicts) {
      if (v.status !== "dead" || !inChannel(v)) continue;
      g[tierOf(v, briefOf(v.leadId))].push(v);
    }
    const score = (v: Verdict) => briefOf(v.leadId)?.likelihood ?? v.prescore;
    for (const t of TIERS) g[t].sort((a, b) => score(b) - score(a));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome.verdicts, briefs, channel, leadsById]);

  const active = outcome.verdicts.filter((v) => v.status === "active" && inChannel(v));
  const excluded = outcome.verdicts.filter((v) => v.status === "excluded" && inChannel(v));
  const deadCount = groups.today.length + groups.week.length + groups.later.length;
  const channels = useMemo(() => [...new Set(outcome.leads.flatMap((l) => l.channels))].sort(), [outcome.leads]);

  const readWithAi = async () => {
    const todo = [...groups.today, ...groups.week, ...groups.later]
      .filter((v) => briefs[v.leadId]?.status !== "done")
      .slice(0, AI_BATCH);
    if (!todo.length) return;
    setAiRunning(true);
    setAiNotice(null);
    setBriefs((b) => ({ ...b, ...Object.fromEntries(todo.map((v) => [v.leadId, { status: "loading" }])) }));
    await pool(todo, 3, async (v) => {
      const state = await fetchBrief(leadsById.get(v.leadId)!, v);
      setBriefs((b) => ({ ...b, [v.leadId]: state }));
      if (state.status === "error" && state.reason !== "failed") {
        setAiNotice(
          state.reason === "not_connected"
            ? "The AI read is not switched on yet, so the order below comes from the conversations alone."
            : "Too many AI reads in a short time. Please wait a few minutes and try again.",
        );
        return false;
      }
      return true;
    });
    setBriefs((b) =>
      Object.fromEntries(Object.entries(b).map(([k, s]) => [k, s.status === "loading" ? { status: "idle" } : s])),
    );
    setAiRunning(false);
  };

  const open = openId ? leadsById.get(openId) : undefined;
  const openVerdict = openId ? outcome.verdicts.find((v) => v.leadId === openId) : undefined;
  const warnings = outcome.warnings.filter((w) => w.code !== "duplicate_file");
  const headline =
    deadCount === 0
      ? "No one has gone quiet. Nice work."
      : groups.today.length > 0
        ? `${plural(deadCount, "person", "people")} went quiet. Start with ${plural(groups.today.length, "person", "people", true)} today.`
        : `${plural(deadCount, "person", "people")} went quiet. None need you urgently; start with this week's list.`;

  return (
    <div className="flex flex-col gap-10">
      {/* Summary */}
      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-5 sm:px-10 lg:px-14">
          <p className="text-label text-rws-gold mb-3">Here is what we found</p>
          <h1 className="heading-section text-rws-text">{headline}</h1>
        </div>

        <div className="px-1 sm:px-6 lg:px-10 pt-5 grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <a key={t} href={`#tier-${t}`} className={`tier-tile tier-tile--${t} rounded-2xl px-5 py-5 flex flex-col gap-2`}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-label">{TIER_TEXT[t].title}</span>
                <span className="text-stat">{groups[t].length}</span>
              </span>
              <span className="text-body text-rws-text-secondary/80">{TIER_TEXT[t].line}</span>
            </a>
          ))}
        </div>

        <p className="px-2 sm:px-6 lg:px-10 pt-5 text-caption text-rws-text-secondary/60">
          Quiet means no message for {quietDays}+ days · Still talking: {active.length} · Left out: {excluded.length} ·{" "}
          {outcome.stats.messages.toLocaleString()} messages read on this device
        </p>

        {warnings.length > 0 && (
          <ul className="px-2 sm:px-6 lg:px-10 mt-4 flex flex-col gap-2">
            {warnings.slice(0, 6).map((w, i) => (
              <li key={i} className="text-body text-rws-text-secondary/70">
                <span className="text-label text-rws-gold mr-3">Note</span>
                {w.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How to use */}
      <section aria-label="How to use this list" className="grid gap-4 sm:grid-cols-3">
        {[
          ["1", "Open a person", "See what they wanted and why they matter, in their own words."],
          ["2", "Decide your offer", "The tool does not know your listings. You choose what to bring them."],
          ["3", "Send and mark it", "Copy the starting message, send it, then tap what happened."],
        ].map(([n, t, d]) => (
          <div key={n} className="border border-rws-box-border rounded-2xl px-5 py-5 flex gap-4">
            <span className="step-dot text-label" aria-hidden="true">
              {n}
            </span>
            <span className="flex flex-col gap-1">
              <span className="heading-h4 text-rws-text">{t}</span>
              <span className="text-body text-rws-text-secondary/70">{d}</span>
            </span>
          </div>
        ))}
      </section>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-label text-rws-text-secondary/70" htmlFor="channel-filter">
            Show
          </label>
          <select
            id="channel-filter"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel | "all")}
            className="text-body bg-rws-bg border border-rws-box-border rounded-xl px-4 py-3 text-rws-text"
          >
            <option value="all">All apps</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_NAMES[c]}
              </option>
            ))}
          </select>
        </div>
        {deadCount > 0 && (
          <button type="button" className="btn-gold" onClick={readWithAi} disabled={aiRunning}>
            {aiRunning ? "Reading…" : `Let AI read the top ${Math.min(AI_BATCH, deadCount)}`}
          </button>
        )}
      </div>
      {aiNotice && (
        <p role="status" className="-mt-6 text-body text-rws-gold">
          {aiNotice}
        </p>
      )}

      {/* Tiers */}
      {TIERS.map((t) =>
        groups[t].length === 0 ? null : (
          <section key={t} id={`tier-${t}`} className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6 scroll-mt-6">
            <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="heading-section text-rws-text">
                {TIER_TEXT[t].title} <span className="text-rws-gold">({groups[t].length})</span>
              </h2>
              <p className="text-body text-rws-text-secondary/70">{TIER_TEXT[t].line}</p>
            </div>
            <ul className="grid gap-3 lg:grid-cols-2">
              {groups[t].slice(0, shown[t]).map((v, i) => (
                <LeadCard
                  key={v.leadId}
                  lead={leadsById.get(v.leadId)!}
                  verdict={v}
                  tier={t}
                  brief={briefs[v.leadId]}
                  outcome={outcomes[v.leadId]}
                  filled={i % 2 === 0}
                  onOpen={() => setOpenId(v.leadId)}
                />
              ))}
            </ul>
            {shown[t] < groups[t].length && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShown((s) => ({ ...s, [t]: s[t] + PAGE * 2 }))}
                >
                  Show more ({groups[t].length - shown[t]} left)
                </button>
              </div>
            )}
          </section>
        ),
      )}

      {/* Still active and left out */}
      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6 flex flex-col gap-3">
        <details className="rounded-2xl bg-rws-box-fill px-5 py-4">
          <summary className="heading-h4 text-rws-text cursor-pointer">
            Still talking ({active.length}) <span className="text-body text-rws-text-secondary/60">· not quiet yet</span>
          </summary>
          <SmallList items={active} leads={leadsById} onOpen={setOpenId} />
        </details>
        <details className="rounded-2xl border border-rws-box-border px-5 py-4">
          <summary className="heading-h4 text-rws-text cursor-pointer">
            Left out ({excluded.length}) <span className="text-body text-rws-text-secondary/60">· and why</span>
          </summary>
          <SmallList items={excluded} leads={leadsById} onOpen={setOpenId} showReason />
        </details>
      </section>

      {open && openVerdict && (
        <LeadSheet
          lead={open}
          verdict={openVerdict}
          brief={briefs[open.id] ?? { status: "idle" }}
          outcome={outcomes[open.id]}
          onOutcome={(id) => setOutcomes(saveOutcome(open.id, id))}
          onRead={async () => {
            setBriefs((b) => ({ ...b, [open.id]: { status: "loading" } }));
            const s = await fetchBrief(open, openVerdict);
            setBriefs((b) => ({ ...b, [open.id]: s }));
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function plural(n: number, one: string, many: string, withThese = false): string {
  if (withThese) return n === 1 ? `this ${one}` : `these ${n}`;
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

function LeadCard({
  lead,
  verdict,
  tier,
  brief,
  outcome,
  filled,
  onOpen,
}: {
  lead: Lead;
  verdict: Verdict;
  tier: Tier;
  brief?: BriefState;
  outcome?: string;
  filled: boolean;
  onOpen: () => void;
}) {
  const done = brief?.status === "done" ? brief.brief : null;
  const reasons = plainSignals(verdict);
  const outcomeLabel = OUTCOMES.find((o) => o.id === outcome)?.label;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`lead-card w-full h-full text-left rounded-2xl px-5 py-5 flex gap-4 ${
          filled ? "bg-rws-box-fill" : "border border-rws-box-border"
        }`}
      >
        <span className={`avatar avatar--${tier} text-label`} aria-hidden="true">
          {initials(lead.name)}
        </span>
        <span className="min-w-0 flex-1 flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="heading-h4 text-rws-text truncate max-w-full">{lead.name}</span>
            {outcomeLabel && <span className="chip chip--gold text-caption">{outcomeLabel}</span>}
          </span>
          <span className="text-caption text-rws-text-secondary/60">
            {lead.channels.map((c) => CHANNEL_NAMES[c]).join(" · ")} · quiet for {daysLabel(verdict.daysSilent)}
          </span>
          {done ? (
            <span className="text-body text-rws-text-secondary/90 line-clamp-2">
              {done.doNotContact ? "The conversation suggests not contacting this person." : done.summary}
            </span>
          ) : verdict.lastLeadMessage ? (
            <span className="text-body text-rws-text-secondary/90 line-clamp-2" dir="auto">
              <span className="text-rws-text-secondary/50">They said: </span>
              <bdi>{verdict.lastLeadMessage}</bdi>
            </span>
          ) : null}
          {reasons.length > 0 && (
            <span className="flex flex-wrap gap-2 pt-1">
              {reasons.map((r) => (
                <span key={r} className="chip text-caption">
                  {r}
                </span>
              ))}
            </span>
          )}
          {brief?.status === "loading" && <span className="text-caption text-rws-gold">AI is reading…</span>}
          {done && (
            <span className="flex items-center gap-3 pt-1">
              <span className="text-caption text-rws-text-secondary/70">Chance they reply and act</span>
              <span className="meter flex-1 max-w-40" aria-hidden="true">
                <span style={{ width: `${done.likelihood}%` }} />
              </span>
              <span className="text-caption text-rws-text">{done.likelihood}%</span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function SmallList({
  items,
  leads,
  onOpen,
  showReason,
}: {
  items: Verdict[];
  leads: Map<string, Lead>;
  onOpen: (id: string) => void;
  showReason?: boolean;
}) {
  if (!items.length) return <p className="text-body text-rws-text-secondary/60 mt-3">No one here.</p>;
  return (
    <ul className="mt-4 flex flex-col divide-y divide-rws-box-border">
      {items.slice(0, 200).map((v) => (
        <li key={v.leadId}>
          <button
            type="button"
            onClick={() => onOpen(v.leadId)}
            className="w-full text-left py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <span className="text-body text-rws-text">{leads.get(v.leadId)!.name}</span>
            <span className="text-caption text-rws-text-secondary/60">
              {showReason && v.excludeReason ? EXCLUDE_NAMES[v.excludeReason] : `last message ${daysLabel(v.daysSilent)} ago`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
