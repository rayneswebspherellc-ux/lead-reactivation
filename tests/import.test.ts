import { describe, expect, it } from "vitest";
import { Importer } from "../src/lib/import";
import { DAY, NOW, metaEncode, metaThread, zip } from "./helpers";

const ME = "Layla Haddad";

describe("Instagram / Facebook export", () => {
  it("reads a full archive, joins message_1 + message_2 across split ZIPs and finds the agent", async () => {
    const root = "instagram-laylahomes-2026-10-01-abc/your_instagram_activity/messages";
    const part1 = zip({
      [`${root}/inbox/sarakhan_17841/message_1.json`]: metaThread({
        me: ME,
        them: "Sara Khan",
        messages: [
          ["them", 95, "Is the 2BR in Marina still available? Budget AED 1.8M"],
          ["me", 94, "Yes! Want to book a viewing?"],
          ["them", 93, "Liked a message"],
        ],
      }),
      [`${root}/inbox/omar_99/message_1.json`]: metaThread({
        me: ME,
        them: "Omar Ali",
        messages: [["them", 3, "Thanks, see you tomorrow at the viewing"], ["me", 2, "👍"]],
      }),
      [`${root}/message_requests/newlead_5/message_1.json`]: metaThread({
        me: ME,
        them: "Jürgen Weiß",
        messages: [["them", 200, "Hi, are there off-plan villas with payment plans?"]],
      }),
      // A non-chat file that must be ignored
      "instagram-laylahomes-2026-10-01-abc/your_instagram_activity/likes/liked_posts.json": JSON.stringify({
        likes_media_likes: [{ title: "x", string_list_data: [{ href: "h", value: "v", timestamp: 1 }] }],
      }),
      "instagram-laylahomes-2026-10-01-abc/media/posts/202601/photo.jpg": new Uint8Array(5000),
    });
    // Older half of Sara's chat arrives in the second ZIP of a split export.
    const part2 = zip({
      [`${root}/inbox/sarakhan_17841/message_2.json`]: metaThread({
        me: ME,
        them: "Sara Khan",
        messages: [["them", 120, "Hello, I follow your page 🏙️"]],
      }),
    });

    const imp = new Importer();
    await imp.addFile("instagram-part1.zip", part1);
    await imp.addFile("instagram-part2.zip", part2);
    const res = imp.finish();

    expect(res.self.instagram).toEqual([ME]);
    expect(res.needsSelf).toEqual([]);
    expect(res.conversations).toHaveLength(3);
    const sara = res.conversations.find((c) => c.leadName === "Sara Khan")!;
    expect(sara.channel).toBe("instagram");
    expect(sara.folder).toBe("inbox");
    expect(sara.messageCount).toBe(4);
    expect(sara.leadTextCount).toBe(2); // the "Liked a message" is a reaction, not text
    expect(sara.sources).toHaveLength(2);
    expect(sara.excerpt[0]!.text).toBe("Hello, I follow your page 🏙️");
    expect(sara.lastTextFrom).toBe("agent");
    const req = res.conversations.find((c) => c.folder === "message_requests")!;
    expect(req.leadName).toBe("Jürgen Weiß");
    expect(req.lastTextFrom).toBe("lead");
  });

  it("knows the agent from a single 1:1 chat, because the chat is titled with the other person", async () => {
    const imp = new Importer({ channelHint: "facebook" });
    await imp.addFile(
      "message_1.json",
      new TextEncoder().encode(
        metaThread({ me: ME, them: "Ali", messages: [["them", 40, "price?"], ["me", 39, "2.1M"]] }),
      ),
    );
    const res = imp.finish();
    expect(res.self.facebook).toEqual([ME]);
    expect(res.conversations[0]!.leadName).toBe("Ali");
    expect(res.conversations[0]!.lastTextFrom).toBe("agent");
  });

  it("asks who the agent is when nothing in the file can tell, then rebuilds without re-reading", async () => {
    const imp = new Importer();
    // A bare _chat.txt (no "WhatsApp Chat with …" name) with two people in it.
    await imp.addFile(
      "_chat.txt",
      new TextEncoder().encode("01/09/2026, 10:00 - Ali: price?\n01/09/2026, 10:05 - Layla: 2.1M\n"),
    );
    const first = imp.finish();
    expect(first.needsSelf).toEqual([{ channel: "whatsapp", candidates: expect.arrayContaining(["Layla", "Ali"]) }]);
    expect(first.conversations[0]!.selfKnown).toBe(false);
    const second = imp.finish({ selfNames: ["Layla"] });
    expect(second.needsSelf).toEqual([]);
    expect(second.conversations[0]!.leadName).toBe("Ali");
    expect(second.conversations[0]!.lastTextFrom).toBe("agent");
  });

  it("joins split ZIPs even when they have no top folder, and keeps the newer of two exports", async () => {
    const path = (n: number) => `your_instagram_activity/messages/inbox/rami_1/message_${n}.json`;
    const imp = new Importer();
    // Export from March, split over two ZIPs with no root folder.
    await imp.addFile(
      "export-march-1.zip",
      zip({ [path(1)]: metaThread({ me: ME, them: "Rami", messages: [["them", 200, "new part"], ["me", 199, "ok"]] }) }),
    );
    await imp.addFile(
      "export-march-2.zip",
      zip({ [path(2)]: metaThread({ me: ME, them: "Rami", messages: [["them", 400, "old part"]] }) }),
    );
    let rami = imp.finish().conversations[0]!;
    expect(rami.messageCount).toBe(3);
    // Same account exported again in October: overlaps March, plus newer messages.
    await imp.addFile(
      "export-october.zip",
      zip({
        [path(1)]: metaThread({
          me: ME,
          them: "Rami",
          messages: [["them", 200, "new part"], ["me", 199, "ok"], ["them", 35, "any news on the villa?"]],
        }),
        [path(2)]: metaThread({ me: ME, them: "Rami", messages: [["them", 400, "old part"]] }),
      }),
    );
    const res = imp.finish();
    expect(res.conversations).toHaveLength(1);
    rami = res.conversations[0]!;
    expect(rami.messageCount).toBe(4); // not 7: the March copy is replaced, not added
    expect(rami.lastTextFrom).toBe("lead");
  });

  it("warns about HTML exports instead of failing silently", async () => {
    const imp = new Importer();
    await imp.addFile(
      "facebook-x.zip",
      zip({ "facebook-x/your_activity_across_facebook/messages/inbox/a_1/message_1.html": "<html></html>" }),
    );
    const res = imp.finish();
    expect(res.warnings.map((w) => w.code)).toContain("html_export");
    expect(res.conversations).toHaveLength(0);
  });

  it("reads the same file only once", async () => {
    const imp = new Importer({ channelHint: "instagram" });
    const bytes = new TextEncoder().encode(
      metaThread({ me: ME, them: "Ali", messages: [["them", 40, "hi"]], threadPath: "inbox/ali_1" }),
    );
    await imp.addFile("message_1.json", bytes);
    await imp.addFile("message_1 (1).json", bytes);
    const res = imp.finish({ selfNames: [ME] });
    expect(res.conversations[0]!.messageCount).toBe(1);
    expect(res.warnings.map((w) => w.code)).toContain("duplicate_file");
  });
});

describe("WhatsApp files", () => {
  it("reads an iPhone ZIP (chat + media), finds the agent across chats and links the lead by phone", async () => {
    const iphone = zip({
      "_chat.txt":
        "[14/03/2026, 09:16:00] +971 50 123 4567: Hi, is the Palm villa still for sale?\n" +
        "[14/03/2026, 09:20:00] Layla: Yes, AED 12M\n" +
        "[14/03/2026, 09:21:00] +971 50 123 4567: ‎image omitted\n",
      "00000012-PHOTO-2026-03-14-09-21-00.jpg": new Uint8Array(20000),
    });
    const android =
      "01/09/2026, 10:00 - Layla: Hello Ahmed, following up on the Amwaj villa\n" +
      "01/09/2026, 10:05 - Ahmed: Still thinking, will tell you next week\n";
    const imp = new Importer();
    await imp.addFile("WhatsApp Chat - +971 50 123 4567.zip", iphone);
    await imp.addFile("WhatsApp Chat with Ahmed.txt", new TextEncoder().encode(android));
    // Same lead also wrote on Instagram and gave their number there.
    await imp.addFile(
      "instagram-x/your_instagram_activity/messages/inbox/pv_1/message_1.json",
      new TextEncoder().encode(
        metaThread({
          me: "laylahomes",
          them: "Palm Villa Buyer",
          messages: [["them", 250, "my WhatsApp is +971501234567"]],
        }),
      ),
    );
    const res = imp.finish({ selfNames: { instagram: ["laylahomes"] } });
    expect(res.self.whatsapp).toEqual(["Layla"]);
    const wa = res.conversations.find((c) => c.channel === "whatsapp" && c.title.startsWith("+971"))!;
    expect(wa.messageCount).toBe(3);
    expect(wa.phones).toContain("+971501234567");
    const merged = res.leads.find((l) => l.channels.length === 2)!;
    expect(merged.name).toBe("Palm Villa Buyer");
    expect(merged.channels.sort()).toEqual(["instagram", "whatsapp"]);
  });

  it("drops overlapping messages when the same chat is exported twice", async () => {
    const a = "01/09/2026, 10:00 - A: one\n01/09/2026, 10:01 - B: two\n";
    const b = a + "02/09/2026, 11:00 - A: three\n";
    const imp = new Importer();
    await imp.addFile("march/WhatsApp Chat with B.txt", new TextEncoder().encode(a));
    await imp.addFile("october/WhatsApp Chat with B.txt", new TextEncoder().encode(b));
    const res = imp.finish({ selfNames: ["A"] });
    expect(res.conversations).toHaveLength(1);
    expect(res.conversations[0]!.messageCount).toBe(3);
  });
});

describe("LinkedIn messages.csv", () => {
  it("groups rows into conversations, strips HTML, skips drafts and keeps the profile URL", async () => {
    const csv = [
      "CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER,ATTACHMENTS,IS MESSAGE DRAFT",
      'c1,,Dana White,https://www.linkedin.com/in/danawhite,Layla Haddad,https://www.linkedin.com/in/layla,2026-02-01 10:00:00 UTC,,"<p>Hi Layla, relocating to Dubai in June.</p><p>Looking for a 3 bed villa, budget around $1M</p>",INBOX,,No',
      "c1,,Layla Haddad,https://www.linkedin.com/in/layla,Dana White,https://www.linkedin.com/in/danawhite,2026-02-01 12:00:00 UTC,,Happy to help! What areas?,INBOX,,No",
      "c1,,Layla Haddad,https://www.linkedin.com/in/layla,Dana White,https://www.linkedin.com/in/danawhite,2026-02-02 12:00:00 UTC,,unsent draft,INBOX,,Yes",
      "c2,,Sam Lee,https://www.linkedin.com/in/samlee,Layla Haddad,https://www.linkedin.com/in/layla,2026-03-01 09:00:00 UTC,Opportunity,Buy crypto now,SPAM,,No",
      "c3,,Layla Haddad,https://www.linkedin.com/in/layla,Ken Wu,https://www.linkedin.com/in/kenwu,2026-03-05 09:00:00 UTC,,Hi Ken,INBOX,,No",
    ].join("\n");
    const imp = new Importer();
    await imp.addFile("Basic_LinkedInDataExport.zip", zip({ "messages.csv": csv, "guide_messages.csv": "x,y\n1,2" }));
    const res = imp.finish();
    expect(res.self.linkedin).toEqual(["Layla Haddad"]);
    const dana = res.conversations.find((c) => c.leadName === "Dana White")!;
    expect(dana.messageCount).toBe(2);
    expect(dana.excerpt[0]!.text).toBe("Hi Layla, relocating to Dubai in June.\nLooking for a 3 bed villa, budget around $1M");
    expect(dana.profileUrl).toBe("https://www.linkedin.com/in/danawhite");
    expect(res.conversations.find((c) => c.leadName === "Sam Lee")!.folder).toBe("SPAM");
  });
});

describe("Telegram and TikTok", () => {
  it("reads a Telegram full export and takes the agent's name from it", async () => {
    const tg = {
      personal_information: { first_name: "Layla", last_name: "Haddad" },
      chats: {
        list: [
          {
            name: "Victor",
            type: "personal_chat",
            id: 42,
            messages: [
              { id: 1, type: "message", date: "2026-01-01T10:00:00", date_unixtime: "1767261600", from: "Victor", from_id: "user42", text: ["Any ", { type: "bold", text: "penthouse" }, " left?"] },
              { id: 2, type: "message", date: "2026-01-01T10:05:00", date_unixtime: "1767261900", from: "Layla Haddad", from_id: "user1", text: "One, 4BR" },
              { id: 3, type: "service", date: "2026-01-01T10:06:00", date_unixtime: "1767261960", actor: "Victor", action: "phone_call" },
            ],
          },
          { name: "Saved Messages", type: "saved_messages", id: 1, messages: [] },
        ],
      },
    };
    const imp = new Importer();
    await imp.addFile("result.json", new TextEncoder().encode(JSON.stringify(tg)));
    const res = imp.finish();
    expect(res.conversations).toHaveLength(1);
    expect(res.conversations[0]!.excerpt[0]!.text).toBe("Any penthouse left?");
    expect(res.conversations[0]!.lastTextFrom).toBe("agent");
  });

  it("finds TikTok chat history wherever it sits in the file", async () => {
    const tt = {
      Profile: {},
      "Direct Message": {
        "Direct Messages": {
          ChatHistory: {
            "Chat History with nina.homes:": [
              { Date: "2026-04-01 10:00:00", From: "nina.homes", Content: "Do you have rentals in JLT?" },
              { Date: "2026-04-01 11:00:00", From: "layla.realty", Content: "Yes, from AED 85k" },
            ],
            "Chat History with friend:": [{ Date: "2026-04-02 10:00:00", From: "friend", Content: "lol" }],
          },
        },
      },
    };
    const imp = new Importer();
    await imp.addFile("user_data_tiktok.json", new TextEncoder().encode(JSON.stringify(tt)));
    const res = imp.finish();
    expect(res.self.tiktok).toEqual(["layla.realty"]);
    expect(res.conversations.find((c) => c.leadName === "nina.homes")!.lastTextFrom).toBe("agent");
  });

  it("falls back to any message-shaped JSON (e.g. a changed export layout)", async () => {
    const odd = {
      threads: [
        { title: metaEncode("Rania"), items: [{ sender: "Rania", timestamp: NOW - 50 * DAY, text: "Still have the villa?" }] },
        { title: "Kim", items: [{ sender: "Kim", timestamp: NOW - 60 * DAY, text: "hey" }, { sender: "Me", timestamp: NOW - 59 * DAY, text: "hi" }] },
      ],
    };
    const imp = new Importer({ channelHint: "facebook" });
    await imp.addFile("secure_storage_messages.json", new TextEncoder().encode(JSON.stringify(odd)));
    const res = imp.finish({ selfNames: ["Me"] });
    expect(res.conversations.map((c) => c.title).sort()).toEqual(["Kim", "Rania"]);
  });
});
