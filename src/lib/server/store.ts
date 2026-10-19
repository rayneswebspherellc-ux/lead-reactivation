import type { Brief } from "../ai/brief";
import { open, ownerKey, seal } from "./crypto";

/**
 * The only way server code may touch saved lead data.
 *
 * Isolation rules (agent A can never see agent B):
 * 1. A store is opened for ONE owner, whose id must come from the verified
 *    login session, never from the request body or URL.
 * 2. No method takes an owner id. Every query is bound to the store's own
 *    owner (WHERE owner_id = ?), and the primary key is (owner_id, lead_id),
 *    so the same lead id under two owners is two separate rows.
 * 3. Everything readable (name, outcome, AI read) is encrypted with that
 *    owner's own key (see crypto.ts). A wrong row cannot be decrypted.
 * 4. Raw chat exports are never sent to or stored on the server.
 * 5. deleteEverything() removes every row the owner has, and the account.
 */

/** The subset of Cloudflare D1 we use (also matched by the test adapter). */
export interface Db {
  prepare(sql: string): Statement;
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface SavedLead {
  leadId: string;
  name: string;
  channels: string[];
  outcome: string | null;
  brief: Brief | null;
  updatedAt: number;
}

type Payload = Omit<SavedLead, "leadId" | "updatedAt">;

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;

export class LeadStore {
  private constructor(
    private readonly db: Db,
    private readonly key: CryptoKey,
    private readonly ownerId: string,
  ) {}

  /** ownerId MUST be the verified session's user id. */
  static async forOwner(db: Db, masterSecret: string, ownerId: string): Promise<LeadStore> {
    if (!ID_RE.test(ownerId)) throw new Error("Invalid owner.");
    const store = new LeadStore(db, await ownerKey(masterSecret, ownerId), ownerId);
    await db
      .prepare("INSERT OR IGNORE INTO accounts (id, created_at) VALUES (?, ?)")
      .bind(ownerId, Date.now())
      .run();
    return store;
  }

  async save(lead: Omit<SavedLead, "updatedAt">): Promise<void> {
    if (!ID_RE.test(lead.leadId)) throw new Error("Invalid lead id.");
    const payload: Payload = {
      name: lead.name,
      channels: lead.channels,
      outcome: lead.outcome,
      brief: lead.brief,
    };
    await this.db
      .prepare(
        "INSERT INTO saved_leads (owner_id, lead_id, payload, updated_at) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT (owner_id, lead_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
      )
      .bind(this.ownerId, lead.leadId, await seal(this.key, this.ownerId, payload), Date.now())
      .run();
  }

  async get(leadId: string): Promise<SavedLead | null> {
    const row = await this.db
      .prepare("SELECT lead_id, payload, updated_at FROM saved_leads WHERE owner_id = ? AND lead_id = ?")
      .bind(this.ownerId, leadId)
      .first<{ lead_id: string; payload: string; updated_at: number }>();
    return row ? this.decode(row) : null;
  }

  async list(): Promise<SavedLead[]> {
    const { results } = await this.db
      .prepare("SELECT lead_id, payload, updated_at FROM saved_leads WHERE owner_id = ? ORDER BY updated_at DESC")
      .bind(this.ownerId)
      .all<{ lead_id: string; payload: string; updated_at: number }>();
    return Promise.all(results.map((r) => this.decode(r)));
  }

  /** Removes everything this owner has saved, then the account itself. */
  async deleteEverything(): Promise<void> {
    await this.db.prepare("DELETE FROM saved_leads WHERE owner_id = ?").bind(this.ownerId).run();
    await this.db.prepare("DELETE FROM accounts WHERE id = ?").bind(this.ownerId).run();
  }

  private async decode(row: { lead_id: string; payload: string; updated_at: number }): Promise<SavedLead> {
    const p = await open<Payload>(this.key, this.ownerId, row.payload);
    return { leadId: row.lead_id, updatedAt: row.updated_at, ...p };
  }
}
