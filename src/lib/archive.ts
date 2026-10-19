import { Unzip, UnzipInflate, type UnzipFile } from "fflate";

/**
 * Streaming ZIP reader. Meta and TikTok exports can be several GB because of
 * photos and videos, split over several ZIPs. We read the archive in chunks
 * and only decompress the small text files we need (.json, .txt, .csv, .html,
 * nested .zip); media is never decompressed or kept.
 */

export type ByteSource = Uint8Array | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export interface ArchiveEntry {
  path: string;
  bytes: Uint8Array;
}

export interface SkippedEntry {
  path: string;
  reason: "too_large" | "unsupported_compression" | "corrupt";
}

const CHUNK = 1 << 20;
const PUSH_SLICE = 32 << 10;

export async function* chunks(src: ByteSource): AsyncGenerator<Uint8Array> {
  if (src instanceof Uint8Array) {
    for (let i = 0; i < src.length; i += CHUNK) yield src.subarray(i, i + CHUNK);
    return;
  }
  if (typeof (src as ReadableStream).getReader === "function") {
    const reader = (src as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  yield* src as AsyncIterable<Uint8Array>;
}

export function isZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5) && (head[3] === 4 || head[3] === 6);
}

export const TEXT_FILE = /\.(json|txt|csv|html?|zip)$/i;

export interface ReadZipOptions {
  /** Largest single text file we will decompress (guards against zip bombs). */
  maxEntryBytes: number;
  accept?: (path: string) => boolean;
  onSkip?: (s: SkippedEntry) => void;
}

export async function* readZip(
  src: AsyncIterable<Uint8Array>,
  opts: ReadZipOptions,
): AsyncGenerator<ArchiveEntry> {
  const accept = opts.accept ?? ((p: string) => TEXT_FILE.test(p));
  const ready: ArchiveEntry[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file: UnzipFile) => {
    const path = file.name;
    if (path.endsWith("/") || !accept(path)) return;
    if (file.originalSize !== undefined && file.originalSize > opts.maxEntryBytes) {
      opts.onSkip?.({ path, reason: "too_large" });
      return;
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    let dropped = false;
    file.ondata = (err, data, final) => {
      if (dropped) return;
      if (err) {
        dropped = true;
        opts.onSkip?.({ path, reason: "corrupt" });
        return;
      }
      size += data.length;
      if (size > opts.maxEntryBytes) {
        dropped = true;
        file.terminate();
        opts.onSkip?.({ path, reason: "too_large" });
        return;
      }
      parts.push(data);
      if (final) ready.push({ path, bytes: concat(parts, size) });
    };
    try {
      file.start();
    } catch {
      dropped = true;
      opts.onSkip?.({ path, reason: "unsupported_compression" });
    }
  };
  for await (const c of src) {
    // fflate recurses once per ZIP entry inside a pushed chunk; archives with
    // thousands of tiny files overflow the stack on big chunks. Push small slices.
    for (let i = 0; i < c.length; i += PUSH_SLICE) {
      unzip.push(c.subarray(i, i + PUSH_SLICE));
      while (ready.length) yield ready.shift()!;
    }
  }
  unzip.push(new Uint8Array(0), true);
  while (ready.length) yield ready.shift()!;
}

export function concat(parts: Uint8Array[], size?: number): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(size ?? parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
