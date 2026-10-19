"use client";

import { useState } from "react";
import type { SelfQuestion } from "@/lib/import";
import type { Channel } from "@/lib/types";
import { CHANNEL_NAMES } from "./labels";

/** Asked only when a file gives no clue which participant is the agent. */
export default function WhoAreYou({
  questions,
  onConfirm,
}: {
  questions: SelfQuestion[];
  onConfirm: (selfNames: Partial<Record<Channel, string[]>>) => void;
}) {
  const [picked, setPicked] = useState<Partial<Record<Channel, string>>>({});
  const ready = questions.every((q) => picked[q.channel]);

  return (
    <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
      <div className="bg-rws-box-fill rounded-2xl px-6 py-4 sm:px-10 sm:py-5 lg:px-14 mb-5">
        <h1 className="heading-section text-rws-text">Which One Is You?</h1>
      </div>
      <div className="px-2 py-2 sm:px-10 sm:py-4 lg:px-14 flex flex-col gap-8">
        <p className="text-body-lg text-rws-text-secondary/80">
          These files do not say which name is yours. Pick your name so we can tell your messages from your leads&apos;.
        </p>
        {questions.map((q) => (
          <fieldset key={q.channel} className="flex flex-col gap-3">
            <legend className="text-label text-rws-gold mb-3">{CHANNEL_NAMES[q.channel]}</legend>
            <div className="flex flex-wrap gap-3">
              {q.candidates.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="btn-outline btn-name"
                  aria-pressed={picked[q.channel] === name}
                  onClick={() => setPicked((p) => ({ ...p, [q.channel]: name }))}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <div>
          <button
            type="button"
            className="btn-gold"
            disabled={!ready}
            onClick={() =>
              onConfirm(
                Object.fromEntries(Object.entries(picked).map(([c, n]) => [c, [n as string]])) as Partial<
                  Record<Channel, string[]>
                >,
              )
            }
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  );
}
