import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { open, ownerKey, seal } from "../src/lib/server/crypto";
import { LeadStore, type Db, type Statement } from "../src/lib/server/store";

// Loaded at runtime: the test bundler does not know the node:sqlite built-in yet.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const SECRET = "test-master-secret-that-is-long-enough-0123456789";

/** node:sqlite wrapped to look like Cloudflare D1, with the real migration. */
function testDb(): { db: Db; raw: DatabaseSyncType } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
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

const lead = (id: string, name: string) => ({
  leadId: id,
  name,
  channels: ["instagram"],
  outcome: null,
  brief: null,
});

describe("agent A can never see agent B's data", () => {
  it("each agent only lists and reads their own leads, even with the same lead id", async () => {
    const { db } = testDb();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    const b = await LeadStore.forOwner(db, SECRET, "agent-b");
    await a.save(lead("lead:1", "Sara (A's client)"));
    await b.save(lead("lead:1", "Omar (B's client)"));
    await b.save(lead("lead:2", "Dana (B's client)"));

    expect((await a.list()).map((l) => l.name)).toEqual(["Sara (A's client)"]);
    expect((await a.get("lead:1"))!.name).toBe("Sara (A's client)");
    expect(await a.get("lead:2")).toBeNull();
    expect((await b.list()).map((l) => l.name).sort()).toEqual(["Dana (B's client)", "Omar (B's client)"]);
  });

  it("an agent writing a lead id that exists for another agent creates their own row, never overwrites", async () => {
    const { db } = testDb();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    const b = await LeadStore.forOwner(db, SECRET, "agent-b");
    await a.save(lead("lead:1", "A's"));
    await b.save({ ...lead("lead:1", "B's"), outcome: "closed" });
    expect((await a.get("lead:1"))!).toMatchObject({ name: "A's", outcome: null });
  });

  it("stores names and AI reads encrypted: nothing readable in the database", async () => {
    const { db, raw } = testDb();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    await a.save({ ...lead("lead:1", "Sara Khan"), outcome: "replied" });
    const dump = JSON.stringify(raw.prepare("SELECT * FROM saved_leads").all());
    expect(dump).not.toContain("Sara");
    expect(dump).not.toContain("replied");
  });

  it("a row copied into another agent's account cannot be decrypted", async () => {
    const { db, raw } = testDb();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    const b = await LeadStore.forOwner(db, SECRET, "agent-b");
    await a.save(lead("lead:1", "Sara Khan"));
    // Simulate a bug or attacker moving A's row under B.
    raw.prepare("UPDATE saved_leads SET owner_id = 'agent-b' WHERE owner_id = 'agent-a'").run();
    await expect(b.list()).rejects.toThrow();
  });

  it("delete everything removes only that agent's data, and the account", async () => {
    const { db, raw } = testDb();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    const b = await LeadStore.forOwner(db, SECRET, "agent-b");
    await a.save(lead("lead:1", "A1"));
    await a.save(lead("lead:2", "A2"));
    await b.save(lead("lead:1", "B1"));
    await a.deleteEverything();
    expect(await a.list()).toEqual([]);
    expect((await b.list()).map((l) => l.name)).toEqual(["B1"]);
    expect(raw.prepare("SELECT id FROM accounts").all()).toEqual([{ id: "agent-b" }]);
  });

  it("refuses odd owner or lead ids", async () => {
    const { db } = testDb();
    await expect(LeadStore.forOwner(db, SECRET, "")).rejects.toThrow();
    await expect(LeadStore.forOwner(db, SECRET, "a' OR '1'='1")).rejects.toThrow();
    const a = await LeadStore.forOwner(db, SECRET, "agent-a");
    await expect(a.save(lead("x'; DROP TABLE saved_leads;--", "x"))).rejects.toThrow();
  });

  it("keys differ per agent and a too-short master secret is refused", async () => {
    const ka = await ownerKey(SECRET, "agent-a");
    const kb = await ownerKey(SECRET, "agent-b");
    const sealed = await seal(ka, "agent-a", { hello: "world" });
    expect(await open(ka, "agent-a", sealed)).toEqual({ hello: "world" });
    await expect(open(kb, "agent-b", sealed)).rejects.toThrow();
    await expect(ownerKey("short", "agent-a")).rejects.toThrow();
  });
});
