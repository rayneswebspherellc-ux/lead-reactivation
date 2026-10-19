"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearAllLocalData } from "@/lib/client/store";
import type { Channel } from "@/lib/types";
import type { FromWorker, Outcome, ToWorker } from "@/workers/import.worker";
import ConfirmDelete from "./ConfirmDelete";
import DropStep from "./DropStep";
import Dashboard from "./Dashboard";
import WhoAreYou from "./WhoAreYou";

type Stage =
  | { name: "drop"; error?: string; notice?: string }
  | { name: "reading"; fileName: string; fileIndex: number; fileCount: number; bytes: number; totalBytes: number }
  | { name: "who"; outcome: Outcome }
  | { name: "results"; outcome: Outcome };

/** The browser's date order, for WhatsApp files whose dates cannot decide it. */
function localeDateOrder(): "dmy" | "mdy" {
  const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2020, 11, 25));
  const m = parts.findIndex((p) => p.type === "month");
  const d = parts.findIndex((p) => p.type === "day");
  return m >= 0 && d >= 0 && m < d ? "mdy" : "dmy";
}

export default function ReactivationApp() {
  const [stage, setStage] = useState<Stage>({ name: "drop" });
  const [quietDays, setQuietDays] = useState(30);
  const [confirming, setConfirming] = useState(false);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const onMessage = useCallback((e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === "progress") {
      setStage({ name: "reading", ...m });
    } else if (m.type === "result") {
      setStage(
        m.outcome.needsSelf.length ? { name: "who", outcome: m.outcome } : { name: "results", outcome: m.outcome },
      );
    } else {
      setStage({ name: "drop", error: m.message });
    }
  }, []);

  const start = (files: File[], days: number) => {
    worker.current?.terminate();
    const w = new Worker(new URL("../workers/import.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = onMessage;
    w.onerror = () => setStage({ name: "drop", error: "Something went wrong while reading the files." });
    worker.current = w;
    setQuietDays(days);
    const total = files.reduce((n, f) => n + f.size, 0);
    setStage({ name: "reading", fileName: files[0]?.name ?? "", fileIndex: 0, fileCount: files.length, bytes: 0, totalBytes: total });
    const msg: ToWorker = {
      type: "read",
      files,
      quietDays: days,
      options: {
        timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
        fallbackDateOrder: localeDateOrder(),
      },
    };
    w.postMessage(msg);
  };

  const confirmSelf = (selfNames: Partial<Record<Channel, string[]>>) => {
    const msg: ToWorker = { type: "finish", selfNames, quietDays };
    worker.current?.postMessage(msg);
  };

  const restart = () => {
    worker.current?.terminate();
    worker.current = null;
    setStage({ name: "drop" });
  };

  /** Ends the reader (dropping every chat it held) and wipes what this browser kept. */
  const deleteEverything = () => {
    worker.current?.terminate();
    worker.current = null;
    clearAllLocalData();
    setConfirming(false);
    setStage({ name: "drop", notice: "Everything was deleted. Nothing about your chats is left in this app." });
  };

  return (
    <main className="min-h-dvh w-full max-w-[1920px] mx-auto px-4 sm:px-10 lg:px-[50px] py-6 sm:py-10">
      <header className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex gap-[3px]">
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
          </span>
          <span className="text-label text-rws-gold">Lead Reactivation</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {stage.name === "results" || stage.name === "who" ? (
            <button type="button" className="btn-outline" onClick={restart}>
              New import
            </button>
          ) : null}
          <button type="button" className="btn-outline" onClick={() => setConfirming(true)}>
            Delete everything
          </button>
        </div>
      </header>

      {confirming && <ConfirmDelete onConfirm={deleteEverything} onCancel={() => setConfirming(false)} />}

      {stage.name === "drop" && (
        <DropStep onStart={start} error={stage.error} notice={stage.notice} defaultQuietDays={quietDays} />
      )}

      {stage.name === "reading" && (
        <section className="border border-rws-box-border rounded-3xl p-6 sm:p-10 lg:p-14" aria-live="polite">
          <h1 className="heading-section text-rws-text mb-3">Reading your conversations</h1>
          <p className="text-body text-rws-text-secondary/80 mb-8">
            Everything is read on this device. Your chats are not uploaded.
          </p>
          <div
            className="progress-track mb-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((stage.bytes / Math.max(1, stage.totalBytes)) * 100)}
          >
            <div className="progress-fill" style={{ width: `${(stage.bytes / Math.max(1, stage.totalBytes)) * 100}%` }} />
          </div>
          <p className="text-caption text-rws-text-secondary/60">
            File {stage.fileIndex + 1} of {stage.fileCount} · {stage.fileName} · {formatBytes(stage.bytes)} of{" "}
            {formatBytes(stage.totalBytes)}
          </p>
        </section>
      )}

      {stage.name === "who" && <WhoAreYou questions={stage.outcome.needsSelf} onConfirm={confirmSelf} />}

      {stage.name === "results" && <Dashboard outcome={stage.outcome} quietDays={quietDays} />}
    </main>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
