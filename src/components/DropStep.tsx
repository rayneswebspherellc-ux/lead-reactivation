"use client";

import { useId, useRef, useState } from "react";
import { formatBytes } from "./ReactivationApp";

const GUIDES: { name: string; steps: string[] }[] = [
  {
    name: "Instagram",
    steps: [
      "Settings and privacy → Accounts Center → Your information and permissions → Download your information.",
      "Choose Some of your information → Messages.",
      "Download to device, Format: JSON, Date range: All time, Media quality: Low.",
      "When Instagram emails you, download every ZIP part and drop them all here.",
    ],
  },
  {
    name: "Facebook Messenger",
    steps: [
      "Accounts Center → Your information and permissions → Download your information.",
      "Choose Messages, Format: JSON, Date range: All time.",
      "Encrypted chats are a separate download: Messenger settings → Privacy & safety → End-to-end encrypted chats → Message storage.",
    ],
  },
  {
    name: "WhatsApp",
    steps: [
      "Open a chat. Android: ⋮ → More → Export chat. iPhone: tap the name → Export chat.",
      "Choose Without media.",
      "Repeat for each chat, then drop all the files here together.",
    ],
  },
  {
    name: "LinkedIn",
    steps: ["Me → Settings & Privacy → Data privacy → Get a copy of your data → Messages.", "Drop the ZIP (or messages.csv) here."],
  },
  {
    name: "TikTok",
    steps: ["Settings and privacy → Account → Download your data → Format: JSON.", "Drop the ZIP or the JSON file here."],
  },
  {
    name: "Telegram",
    steps: ["Telegram Desktop → Settings → Advanced → Export Telegram data → Machine-readable JSON.", "Drop result.json here."],
  },
];

const PRIVACY = [
  "Your chats are read on this device. They are never uploaded or saved by us.",
  "When you ask for an AI read of one person, only the last part of that one conversation is sent to the AI. Nothing is kept afterwards.",
  "We never contact your leads, sell them, or share them. They stay yours.",
  "One tap on “Delete everything” removes all of it, any time.",
];

export default function DropStep({
  onStart,
  error,
  notice,
  defaultQuietDays,
}: {
  onStart: (files: File[], quietDays: number) => void;
  error?: string;
  notice?: string;
  defaultQuietDays: number;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [quietDays, setQuietDays] = useState(defaultQuietDays);
  const input = useRef<HTMLInputElement>(null);
  const daysId = useId();

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5">
          <h1 className="heading-section text-rws-text">Find The Leads Worth Contacting Again</h1>
        </div>
        <div className="px-2 py-2 sm:px-10 sm:py-4 lg:px-14">
          <p className="text-body-lg text-rws-text-secondary/80 mb-6">
            Drop the chat exports from Instagram, Facebook, WhatsApp, LinkedIn, TikTok or Telegram. Everything is read on
            this device; your chats are not uploaded.
          </p>

          <div
            className="dropzone rounded-2xl px-6 py-12 sm:py-16 text-center"
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
          >
            <p className="heading-h4 text-rws-text mb-2">Drop ZIP, JSON, TXT or CSV files here</p>
            <p className="text-body text-rws-text-secondary/60 mb-6">Any size. Split exports: drop every part.</p>
            <button type="button" className="btn-outline" onClick={() => input.current?.click()}>
              Choose files
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept=".zip,.json,.txt,.csv"
              className="sr-only"
              aria-label="Choose export files"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="mt-6 flex flex-col gap-2" aria-label="Files to read">
              {files.map((f) => (
                <li
                  key={`${f.name}:${f.size}`}
                  className="flex items-center justify-between gap-4 border border-rws-box-border rounded-xl px-4 py-3"
                >
                  <span className="text-body text-rws-text truncate">{f.name}</span>
                  <span className="flex items-center gap-4 shrink-0">
                    <span className="text-caption text-rws-text-secondary/60">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      className="text-caption text-rws-text-secondary/60 hover:text-rws-gold"
                      onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                      aria-label={`Remove ${f.name}`}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-col sm:flex-row sm:items-end gap-6 sm:justify-between">
            <div className="flex flex-col gap-2">
              <label htmlFor={daysId} className="text-label text-rws-text-secondary/70">
                Dead after (days of silence)
              </label>
              <input
                id={daysId}
                type="number"
                min={7}
                max={730}
                value={quietDays}
                onChange={(e) => setQuietDays(Math.max(7, Math.min(730, Number(e.target.value) || 30)))}
                className="text-body bg-transparent border border-rws-box-border rounded-xl px-4 py-3 w-32 text-rws-text"
              />
            </div>
            <button
              type="button"
              className="btn-gold"
              disabled={files.length === 0}
              onClick={() => onStart(files, quietDays)}
            >
              Find dead leads
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-6 text-body text-rws-gold">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-6 text-body text-rws-gold">
              {notice}
            </p>
          )}
        </div>
      </section>

      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5">
          <h2 className="heading-section text-rws-text">Your Privacy</h2>
        </div>
        <ul className="px-2 sm:px-10 lg:px-14 pb-2 grid gap-4 md:grid-cols-2">
          {PRIVACY.map((p) => (
            <li key={p} className="flex gap-4 items-start">
              <span aria-hidden="true" className="mt-2 w-2 h-2 rounded-full bg-rws-gold shrink-0" />
              <span className="text-body text-rws-text-secondary/80">{p}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5">
          <h2 className="heading-section text-rws-text">How To Export Your Chats</h2>
        </div>
        <div className="px-2 sm:px-10 lg:px-14 pb-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {GUIDES.map((g, i) => (
            <details
              key={g.name}
              className={`rounded-2xl px-5 py-4 ${i % 2 === 0 ? "bg-rws-box-fill" : "border border-rws-box-border"}`}
            >
              <summary className="heading-h4 text-rws-text cursor-pointer">{g.name}</summary>
              <ol className="mt-3 flex flex-col gap-2 list-decimal pl-5">
                {g.steps.map((s) => (
                  <li key={s} className="text-body text-rws-text-secondary/80">
                    {s}
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
