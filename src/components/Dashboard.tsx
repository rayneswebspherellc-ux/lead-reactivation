"use client";

import { useMemo, useState } from "react";
import type { Verdict } from "@/lib/dormancy";
import { fetchBrief, loadOutcomes, pool, saveOutcome, type BriefState } from "@/lib/client/store";
import type { Channel, Lead } from "@/lib/types";
import type { Outcome } from "@/workers/import.worker";
import { CHANNEL_NAMES, EXCLUDE_NAMES, OUTCOMES, daysLabel } from "./labels";
import LeadSheet from "./LeadSheet";

const PAGE = 50;
const AI_BATCH = 20;

type Tab = "dead" | "active" | "excluded";

export default function Dashboard({ outcome, quietDays }: { outcome: Outcome; quietDays: number }) {
  const leadsById = useMemo(() => new Map(outcome.leads.map((l) => [l.id, l])), [outcome.leads]);
  const [tab, setTab] = useState<Tab>("dead");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Record<string, BriefState>>({});
  // The dashboard only mounts in the browser (after files are read), so storage is available.
  const [outcomes, setOutcomes] = useState<Record<string, string>>(loadOutcomes);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  const counts = useMemo(() => {
    const c = { dead: 0, active: 0, excluded: 0 };
    for (const v of outcome.verdicts) c[v.status]++;
    return c;
  }, [outcome.verdicts]);

  const channels = useMemo(
    () => [...new Set(outcome.leads.flatMap((l) => l.channels))].sort(),
    [outcome.leads],
  );

  // Dead leads: after the AI read, rank by AI likelihood; before it, by the rule-based order.
  const list = useMemo(() => {
    const score = (v: Verdict) => {
      const b = briefs[v.leadId];
      if (b?.status === "done") return b.brief.doNotContact ? -1 : 100 + b.brief.likelihood;
      return v.prescore;
    };
    return outcome.verdicts
      .filter((v) => v.status === tab)
      .filter((v) => channel === "all" || leadsById.get(v.leadId)!.channels.includes(channel))
      .sort((a, b) => (tab === "dead" ? score(b) - score(a) : 0));
  }, [outcome.verdicts, tab, channel, leadsById, briefs]);

  const readWithAi = async () => {
    const todo = list
      .filter((v) => v.status === "dead" && briefs[v.leadId]?.status !== "done")
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
            ? "The AI read is not connected yet (no API key on the server). The list below uses the rule-based order."
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

  const setOutcome = (leadId: string, id: string | null) => setOutcomes(saveOutcome(leadId, id));

  const open = openId ? leadsById.get(openId) : undefined;
  const openVerdict = openId ? outcome.verdicts.find((v) => v.leadId === openId) : undefined;
  const warnings = outcome.warnings.filter((w) => w.code !== "duplicate_file");

  return (
    <div className="flex flex-col gap-10">
      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5">
          <h1 className="heading-section text-rws-text">Your Dead Leads</h1>
        </div>
        <div className="px-2 sm:px-10 lg:px-14 pb-2 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat value={counts.dead} label={`Silent ${quietDays}+ days`} gold />
          <Stat value={counts.active} label="Still active" />
          <Stat value={counts.excluded} label="Left out" />
          <Stat value={outcome.stats.messages} label="Messages read" />
        </div>
        {warnings.length > 0 && (
          <ul className="px-2 sm:px-10 lg:px-14 mt-6 flex flex-col gap-2">
            {warnings.slice(0, 6).map((w, i) => (
              <li key={i} className="text-body text-rws-text-secondary/70">
                <span className="text-label text-rws-gold mr-3">Note</span>
                {w.detail}
                {w.file ? <span className="text-caption text-rws-text-secondary/50"> · {w.file.split("/").pop()}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-2 sm:px-4 lg:px-6 py-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Lead groups">
            {(["dead", "active", "excluded"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                className="btn-outline"
                onClick={() => {
                  setTab(t);
                  setShown(PAGE);
                }}
              >
                {t === "dead" ? "Contact these" : t === "active" ? "Still active" : "Left out"} ({counts[t]})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor="channel-filter">
              Platform
            </label>
            <select
              id="channel-filter"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel | "all")}
              className="text-body bg-rws-bg border border-rws-box-border rounded-xl px-4 py-3 text-rws-text"
            >
              <option value="all">All platforms</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_NAMES[c]}
                </option>
              ))}
            </select>
            {tab === "dead" && (
              <button type="button" className="btn-gold" onClick={readWithAi} disabled={aiRunning || !list.length}>
                {aiRunning ? "Reading…" : `Read top ${Math.min(AI_BATCH, list.length)} with AI`}
              </button>
            )}
          </div>
        </div>
        {aiNotice && (
          <p role="status" className="px-2 sm:px-4 lg:px-6 mt-2 text-body text-rws-gold">
            {aiNotice}
          </p>
        )}

        {list.length === 0 ? (
          <p className="px-2 sm:px-4 lg:px-6 py-10 text-body text-rws-text-secondary/70">Nothing here.</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {list.slice(0, shown).map((v, i) => (
              <LeadRow
                key={v.leadId}
                lead={leadsById.get(v.leadId)!}
                verdict={v}
                brief={briefs[v.leadId]}
                outcome={outcomes[v.leadId]}
                filled={i % 2 === 0}
                onOpen={() => setOpenId(v.leadId)}
              />
            ))}
          </ul>
        )}
        {shown < list.length && (
          <div className="mt-6 flex justify-center">
            <button type="button" className="btn-outline" onClick={() => setShown((s) => s + PAGE)}>
              Show more ({list.length - shown} left)
            </button>
          </div>
        )}
      </section>

      {open && openVerdict && (
        <LeadSheet
          lead={open}
          verdict={openVerdict}
          brief={briefs[open.id] ?? { status: "idle" }}
          outcome={outcomes[open.id]}
          onOutcome={(id) => setOutcome(open.id, id)}
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

function Stat({ value, label, gold }: { value: number; label: string; gold?: boolean }) {
  return (
    <div className="border border-rws-box-border rounded-2xl px-5 py-5">
      <p className={`text-stat ${gold ? "text-rws-gold" : "text-rws-text"}`}>{value.toLocaleString()}</p>
      <p className="text-label text-rws-text-secondary/70 mt-3">{label}</p>
    </div>
  );
}

function LeadRow({
  lead,
  verdict,
  brief,
  outcome,
  filled,
  onOpen,
}: {
  lead: Lead;
  verdict: Verdict;
  brief?: BriefState;
  outcome?: string;
  filled: boolean;
  onOpen: () => void;
}) {
  const done = brief?.status === "done" ? brief.brief : null;
  const outcomeLabel = OUTCOMES.find((o) => o.id === outcome)?.label;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`w-full text-left rounded-2xl px-5 py-4 sm:px-6 sm:py-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center ${
          filled ? "bg-rws-box-fill" : "border border-rws-box-border"
        }`}
      >
        <span className="min-w-0 flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="heading-h4 text-rws-text truncate">{lead.name}</span>
            <span className="text-caption text-rws-text-secondary/60">
              {lead.channels.map((c) => CHANNEL_NAMES[c]).join(" · ")}
            </span>
            {outcomeLabel && <span className="text-label text-rws-gold">{outcomeLabel}</span>}
          </span>
          <span className="text-body text-rws-text-secondary/80 line-clamp-2" dir="auto">
            {verdict.status === "excluded" && verdict.excludeReason
              ? EXCLUDE_NAMES[verdict.excludeReason]
              : done
                ? done.doNotContact
                  ? "The AI read suggests not contacting this lead."
                  : done.summary
                : verdict.lastLeadMessage
                  ? <bdi>{verdict.lastLeadMessage}</bdi>
                  : ""}
          </span>
        </span>
        <span className="flex sm:flex-col sm:items-end gap-3 sm:gap-1 shrink-0">
          <span className="text-label text-rws-text-secondary/70">Silent {daysLabel(verdict.daysSilent)}</span>
          {verdict.status === "dead" && (
            <span className="text-caption text-rws-text-secondary/60">
              {brief?.status === "loading"
                ? "Reading…"
                : done
                  ? `Likelihood ${done.likelihood}`
                  : verdict.pattern === "lead_waiting"
                    ? "They wrote last"
                    : "You wrote last"}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
