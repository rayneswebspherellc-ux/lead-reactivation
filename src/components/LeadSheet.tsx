"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/dormancy";
import type { BriefState } from "@/lib/client/store";
import type { Lead } from "@/lib/types";
import { CHANNEL_NAMES, EXCLUDE_NAMES, OUTCOMES, daysLabel } from "./labels";

const SHOW_MESSAGES = 30;

export default function LeadSheet({
  lead,
  verdict,
  brief,
  outcome,
  onOutcome,
  onRead,
  onClose,
}: {
  lead: Lead;
  verdict: Verdict;
  brief: BriefState;
  outcome?: string;
  onOutcome: (id: string | null) => void;
  onRead: () => void;
  onClose: () => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const messages = lead.conversations
    .filter((c) => !c.isGroup)
    .flatMap((c) => c.excerpt.map((m) => ({ ...m, channel: c.channel })))
    .filter((m) => m.from !== "system")
    .sort((a, b) => a.at - b.at)
    .slice(-SHOW_MESSAGES);

  const done = brief.status === "done" ? brief.brief : null;
  const phone = lead.phones[0]?.replace(/\D/g, "");
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="sheet-backdrop absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-name"
        className="sheet relative w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto bg-rws-bg border border-rws-box-border rounded-t-3xl sm:rounded-3xl p-4 sm:p-6"
      >
        <div className="bg-rws-box-fill rounded-2xl px-5 py-4 sm:px-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="lead-name" className="heading-section text-rws-text break-words">
              {lead.name}
            </h2>
            <p className="text-caption text-rws-text-secondary/70 mt-2">
              {lead.channels.map((c) => CHANNEL_NAMES[c]).join(" · ")} · silent {daysLabel(verdict.daysSilent)} ·{" "}
              {verdict.pattern === "lead_waiting" ? "they wrote last" : "you wrote last"}
            </p>
          </div>
          <button ref={closeBtn} type="button" className="btn-outline shrink-0" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="px-1 sm:px-4 py-6 flex flex-col gap-8">
          {verdict.status === "excluded" && verdict.excludeReason && (
            <p className="text-body text-rws-gold">{EXCLUDE_NAMES[verdict.excludeReason]}.</p>
          )}

          {(lead.phones.length > 0 || lead.emails.length > 0) && (
            <p className="text-body text-rws-text-secondary/80">
              <span className="text-label text-rws-text-secondary/60 mr-3">From the chat</span>
              {[...lead.phones, ...lead.emails].join(" · ")}
            </p>
          )}

          {/* AI read */}
          <section aria-labelledby="ai-read" className="flex flex-col gap-5">
            <h3 id="ai-read" className="text-label text-rws-gold">
              AI read
            </h3>
            {brief.status === "idle" && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <button type="button" className="btn-gold self-start" onClick={onRead} disabled={verdict.status === "excluded"}>
                  Read this lead
                </button>
                <p className="text-body text-rws-text-secondary/60">
                  Sends only this conversation, trimmed, to the AI. Nothing is stored.
                </p>
              </div>
            )}
            {brief.status === "loading" && <p className="text-body text-rws-text-secondary/70">Reading…</p>}
            {brief.status === "error" && (
              <p className="text-body text-rws-gold">
                {brief.reason === "not_connected"
                  ? "The AI read is not connected yet (no API key on the server)."
                  : brief.reason === "rate_limited"
                    ? "Too many AI reads in a short time. Please try again in a few minutes."
                    : "The AI read failed. Please try again."}
              </p>
            )}
            {done && (
              <>
                {done.doNotContact && (
                  <p className="text-body text-rws-gold">The conversation suggests this lead should not be contacted.</p>
                )}
                <p className="text-body-lg text-rws-text">{done.summary}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Meter label="Interest" value={done.interest} />
                  <Meter label="Likelihood" value={done.likelihood} />
                </div>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  <Fact term="Stage" value={done.stage} />
                  <Fact term="Looking to" value={done.who === "unclear" ? null : done.who} />
                  <Fact term="Area" value={done.wanted.area} />
                  <Fact term="Property" value={done.wanted.propertyType} />
                  <Fact term="Budget" value={done.wanted.budget} />
                  <Fact term="Timeline" value={done.wanted.timeline} />
                </dl>
                <p className="text-body text-rws-text-secondary/80">
                  <span className="text-label text-rws-text-secondary/60 mr-3">Why it went cold</span>
                  {done.whyCold}
                </p>
                {done.evidence.length > 0 && (
                  <ul className="flex flex-col gap-3">
                    {done.evidence.map((e) => (
                      <li key={e.quote} className="border-l border-rws-gold/60 pl-4">
                        <p className="text-body text-rws-text">{e.point}</p>
                        <p className="text-body text-rws-text-secondary/70" dir="auto">
                          <bdi>{e.quote}</bdi>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {done.thinkAbout.length > 0 && (
                  <div className="bg-rws-box-fill rounded-2xl px-5 py-5">
                    <h4 className="text-label text-rws-gold mb-3">Something to think about</h4>
                    <ul className="flex flex-col gap-2 list-disc pl-5">
                      {done.thinkAbout.map((q) => (
                        <li key={q} className="text-body text-rws-text">
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!done.doNotContact && done.opener && (
                  <div className="border border-rws-box-border rounded-2xl px-5 py-5 flex flex-col gap-4">
                    <h4 className="text-label text-rws-text-secondary/70">
                      Starting message · {done.language} · edit and add your offer
                    </h4>
                    <p className="text-body-lg text-rws-text whitespace-pre-wrap" dir="auto">
                      {done.opener}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="btn-outline" onClick={() => copy(done.opener)}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                      {phone && (
                        <a
                          className="btn-outline"
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(done.opener)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open in WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Outcome */}
          <section aria-labelledby="outcome" className="flex flex-col gap-3">
            <h3 id="outcome" className="text-label text-rws-gold">
              What happened
            </h3>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="btn-outline"
                  aria-pressed={outcome === o.id}
                  onClick={() => onOutcome(outcome === o.id ? null : o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          {/* Conversation */}
          <section aria-labelledby="conversation" className="flex flex-col gap-3">
            <h3 id="conversation" className="text-label text-rws-gold">
              Latest messages
            </h3>
            <ol className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <li
                  key={`${m.at}-${i}`}
                  className={`max-w-[85%] px-4 py-3 ${m.from === "lead" ? "bubble-lead self-start" : "bubble-agent self-end"}`}
                >
                  <p className="text-body text-rws-text whitespace-pre-wrap break-words" dir="auto">
                    {m.kind === "text" ? m.text : <span className="text-rws-text-secondary/60">[{m.kind.replace("_", " ")}]</span>}
                  </p>
                  <p className="text-caption text-rws-text-secondary/50 mt-1">
                    {new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    {CHANNEL_NAMES[m.channel]}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-label text-rws-text-secondary/70">{label}</span>
        <span className="text-label text-rws-text">{value}</span>
      </div>
      <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label text-rws-text-secondary/60">{term}</dt>
      <dd className="text-body text-rws-text capitalize-first">{value}</dd>
    </div>
  );
}
