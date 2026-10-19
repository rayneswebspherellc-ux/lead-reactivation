/// <reference lib="webworker" />
import { findDeadLeads, type Verdict } from "@/lib/dormancy";
import { Importer, type ImportOptions, type ImportResult } from "@/lib/import";
import type { Channel, Lead } from "@/lib/types";

/**
 * Reads the dropped files off the main thread, so the page stays responsive on
 * multi-GB exports. Nothing here talks to the network: chats stay on the device.
 */

export type ToWorker =
  | { type: "read"; files: File[]; options: ImportOptions; quietDays: number }
  | { type: "finish"; selfNames: Partial<Record<Channel, string[]>>; quietDays: number };

export interface Outcome {
  leads: Lead[];
  verdicts: Verdict[];
  needsSelf: ImportResult["needsSelf"];
  self: ImportResult["self"];
  warnings: ImportResult["warnings"];
  stats: ImportResult["stats"];
}

export type FromWorker =
  | { type: "progress"; fileName: string; fileIndex: number; fileCount: number; bytes: number; totalBytes: number }
  | { type: "result"; outcome: Outcome }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let importer: Importer | null = null;

function post(m: FromWorker) {
  ctx.postMessage(m);
}

function outcome(res: ImportResult, quietDays: number): Outcome {
  return {
    leads: res.leads,
    verdicts: findDeadLeads(res.leads, { now: Date.now(), quietDays }),
    needsSelf: res.needsSelf,
    self: res.self,
    warnings: res.warnings,
    stats: res.stats,
  };
}

async function* counted(
  file: File,
  onBytes: (n: number) => void,
): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader();
  let read = 0;
  let last = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      const now = performance.now();
      if (now - last > 150) {
        last = now;
        onBytes(read);
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
    onBytes(read);
  }
}

ctx.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "read") {
      importer = new Importer(msg.options);
      const totalBytes = msg.files.reduce((n, f) => n + f.size, 0);
      let doneBytes = 0;
      for (let i = 0; i < msg.files.length; i++) {
        const file = msg.files[i]!;
        const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        await importer.addFile(
          name,
          counted(file, (n) =>
            post({
              type: "progress",
              fileName: file.name,
              fileIndex: i,
              fileCount: msg.files.length,
              bytes: doneBytes + n,
              totalBytes,
            }),
          ),
        );
        doneBytes += file.size;
      }
      post({ type: "result", outcome: outcome(importer.finish(), msg.quietDays) });
    } else if (msg.type === "finish") {
      if (!importer) throw new Error("Nothing has been read yet.");
      post({ type: "result", outcome: outcome(importer.finish({ selfNames: msg.selfNames }), msg.quietDays) });
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
