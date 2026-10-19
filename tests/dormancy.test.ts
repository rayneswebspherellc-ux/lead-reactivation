import { describe, expect, it } from "vitest";
import { findDeadLeads } from "../src/lib/dormancy";
import { Importer } from "../src/lib/import";
import { NOW, metaThread, zip } from "./helpers";

const ME = "Layla Haddad";
const root = "instagram-x/your_instagram_activity/messages/inbox";

async function leads(threads: Record<string, string>) {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(threads)) files[`${root}/${k}/message_1.json`] = v;
  const imp = new Importer();
  await imp.addFile("ig.zip", zip(files));
  return imp.finish().leads;
}

describe("dead lead rules", () => {
  it("sorts dead leads first, ranks unanswered intent highest and excludes the right ones", async () => {
    const all = await leads({
      waiting: metaThread({
        me: ME,
        them: "Unanswered Buyer",
        messages: [
          ["me", 70, "Hi! Thanks for following"],
          ["them", 60, "Looking to buy a 3 bed villa, budget AED 4M, need mortgage. When can I view?"],
        ],
      }),
      quiet: metaThread({
        me: ME,
        them: "Quiet Renter",
        messages: [["them", 45, "rent in JLT?"], ["me", 44, "Yes, from 85k. Want options?"]],
      }),
      fresh: metaThread({ me: ME, them: "Active Lead", messages: [["them", 3, "see you Sunday for the viewing"]] }),
      optout: metaThread({
        me: ME,
        them: "Opted Out",
        messages: [["me", 50, "Any update?"], ["them", 49, "Not interested anymore, please stop"]],
      }),
      silent: metaThread({ me: ME, them: "Never Wrote", messages: [["me", 90, "Hello!"]] }),
      reacted: metaThread({ me: ME, them: "Only Liked", messages: [["me", 90, "New launch!"], ["them", 89, "Liked a message"]] }),
    });
    const verdicts = findDeadLeads(all, { now: NOW, quietDays: 30 });
    const by = (name: string) => verdicts.find((v) => all.find((l) => l.id === v.leadId)!.name === name)!;

    expect(verdicts[0]!.leadId).toBe(by("Unanswered Buyer").leadId);
    expect(by("Unanswered Buyer")).toMatchObject({ status: "dead", pattern: "lead_waiting", daysSilent: 60 });
    expect(by("Unanswered Buyer").signals).toEqual(
      expect.arrayContaining(["left without a reply", "last message was a question", "buy", "finance", "money"]),
    );
    expect(by("Quiet Renter")).toMatchObject({ status: "dead", pattern: "went_quiet" });
    expect(by("Unanswered Buyer").prescore).toBeGreaterThan(by("Quiet Renter").prescore);
    expect(by("Active Lead").status).toBe("active");
    expect(by("Opted Out")).toMatchObject({ status: "excluded", excludeReason: "opted_out" });
    expect(by("Never Wrote")).toMatchObject({ status: "excluded", excludeReason: "lead_never_wrote" });
    expect(by("Only Liked")).toMatchObject({ status: "excluded", excludeReason: "lead_never_wrote" });
  });

  it("understands Arabic intent and Arabic opt-outs", async () => {
    const imp = new Importer();
    await imp.addFile(
      "WhatsApp Chat with Fatima.txt",
      new TextEncoder().encode(
        "01/06/2026, 10:00 - Fatima: أبحث عن شقة للشراء، الميزانية ٢ مليون درهم؟\n" +
          "01/06/2026, 10:30 - Layla: أهلا فاطمة\n",
      ),
    );
    await imp.addFile(
      "WhatsApp Chat with Hassan.txt",
      new TextEncoder().encode("01/06/2026, 10:00 - Layla: مرحبا\n01/06/2026, 10:05 - Hassan: غير مهتم شكرا\n"),
    );
    const res = imp.finish();
    const verdicts = findDeadLeads(res.leads, { now: NOW });
    const fatima = verdicts.find((v) => res.leads.find((l) => l.id === v.leadId)!.name === "Fatima")!;
    const hassan = verdicts.find((v) => res.leads.find((l) => l.id === v.leadId)!.name === "Hassan")!;
    expect(fatima.status).toBe("dead");
    expect(fatima.signals).toEqual(expect.arrayContaining(["buy", "property", "budget"]));
    expect(hassan.excludeReason).toBe("opted_out");
  });
});
