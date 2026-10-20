import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Db, Statement } from "../src/lib/server/store";

// Loaded at runtime: the test bundler does not know the node:sqlite built-in yet.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/** node:sqlite wrapped to look like Cloudflare D1, with every real migration applied. */
export function testDb(): { db: Db; raw: DatabaseSyncType } {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(new URL(f, dir), "utf8"));
  }
  const db: Db = {
    prepare(sql) {
      let args: unknown[] = [];
      const st: Statement = {
        bind: (...v) => ((args = v), st),
        run: async () => raw.prepare(sql).run(...(args as never[])),
        all: async <T,>() => ({ results: raw.prepare(sql).all(...(args as never[])) as T[] }),
        first: async <T,>() => (raw.prepare(sql).get(...(args as never[])) as T | undefined) ?? null,
      };
      return st;
    },
  };
  return { db, raw };
}
