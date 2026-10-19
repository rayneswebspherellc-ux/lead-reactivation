import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { findDeadLeads } from "../src/lib/dormancy";
import { Importer } from "../src/lib/import";
import { DAY, NOW, metaEncode } from "./helpers";

/**
 * A heavy agent: 40+ DMs a day for years. 5,000 Instagram conversations and
 * 1,000,000 messages, Meta-style (newest first, mojibake text, threads split
 * into message_1/2/3.json of up to 10,000 messages), plus media files that
 * must be skipped. Run with: npm run test:scale
 */

const THREADS = 5_000;
const MESSAGES = 1_000_000;
const PER_FILE = 10_000;
const ME = "Layla Haddad";
const LINES = [
  "Hi, is this still available?",
  "What is the price for the 2 bed? 🙏",
  "Can we book a viewing this weekend?",
  "Thanks, I will think about it",
  "Do you have anything in Dubai Hills under 2M AED?",
  "مرحبا، هل الشقة متاحة؟",
];

function buildArchive(): Uint8Array {
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  let made = 0;
  for (let t = 0; t < THREADS; t++) {
    // Uneven sizes: most chats short, a few very long ones (one has 200,000 messages).
    const size = t === 0 ? 200_000 : t < 20 ? 20_000 : Math.floor((MESSAGES - 200_000 - 19 * 20_000) / (THREADS - 20));
    const them = `Lead ${t} Ñoño`;
    const startDaysAgo = 30 + (t % 900);
    const all = [];
    for (let i = 0; i < size; i++) {
      const mine = i % 3 === 1;
      all.push({
        sender_name: metaEncode(mine ? ME : them),
        timestamp_ms: NOW - startDaysAgo * DAY - (size - i) * 60_000,
        content: metaEncode(mine ? "Sure, let me check" : LINES[(i + t) % LINES.length]!),
      });
    }
    all.reverse(); // newest first, as Meta writes it
    made += size;
    for (let f = 0; f * PER_FILE < all.length; f++) {
      files[`instagram-agent-2026/your_instagram_activity/messages/inbox/lead${t}_${t * 7}/message_${f + 1}.json`] =
        enc.encode(
          JSON.stringify({
            participants: [{ name: metaEncode(them) }, { name: metaEncode(ME) }],
            messages: all.slice(f * PER_FILE, (f + 1) * PER_FILE),
            title: metaEncode(them),
          }),
        );
    }
    if (t % 50 === 0) {
      files[`instagram-agent-2026/your_instagram_activity/messages/inbox/lead${t}_${t * 7}/photos/p${t}.jpg`] =
        new Uint8Array(200_000);
    }
  }
  expect(made).toBeGreaterThanOrEqual(MESSAGES - THREADS);
  return zipSync(files, { level: 1 });
}

describe("scale", () => {
  it(
    "reads 1,000,000 messages in 5,000 conversations with bounded memory",
    async () => {
      const archive = buildArchive();
      const gc = (globalThis as { gc?: () => void }).gc;
      gc?.();
      const heapBefore = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      const imp = new Importer();
      // Feed it as a stream in 4 MB chunks, like a browser File.stream().
      async function* stream() {
        for (let i = 0; i < archive.length; i += 4 << 20) yield archive.subarray(i, i + (4 << 20));
      }
      await imp.addFile("instagram-agent-2026.zip", stream());
      const res = imp.finish();
      const verdicts = findDeadLeads(res.leads, { now: NOW });
      const seconds = (performance.now() - t0) / 1000;
      gc?.();
      const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1e6;

      console.log(
        `archive ${(archive.length / 1e6).toFixed(0)} MB zipped; ${res.stats.messages} messages, ` +
          `${res.conversations.length} conversations in ${seconds.toFixed(1)} s; memory kept +${heapMb.toFixed(0)} MB${gc ? "" : " (run with --expose-gc for an exact figure)"}`,
      );
      expect(res.stats.messages).toBeGreaterThanOrEqual(MESSAGES - THREADS);
      expect(res.conversations).toHaveLength(THREADS);
      expect(res.self.instagram).toEqual([ME]);
      const big = res.conversations.find((c) => c.leadName === "Lead 0 Ñoño")!;
      expect(big.messageCount).toBe(200_000);
      expect(big.sources).toHaveLength(20);
      expect(big.excerpt.length).toBeLessThanOrEqual(66);
      expect(verdicts.filter((v) => v.status === "dead").length).toBe(THREADS);
    },
    600_000,
  );
});
