import { describe, expect, it } from "vitest";
import { inferDateOrder, looksLikeWhatsApp, parseWhatsApp, titleFromFileName } from "../src/lib/parsers/whatsapp";

const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s);

describe("WhatsApp export", () => {
  it("reads Android 24h (day first), multi-line messages and system lines", () => {
    const txt = [
      "14/03/2026, 09:15 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.",
      "14/03/2026, 09:16 - Sara Khan: Hi, I saw the 2BR in Dubai Marina",
      "is it still available?",
      "14/03/2026, 09:20 - Omar (Agent): Yes it is",
      "14/03/2026, 09:21 - Sara Khan: <Media omitted>",
      "15/03/2026, 18:02 - Sara Khan: This message was deleted",
    ].join("\n");
    const { part } = parseWhatsApp(txt, "WhatsApp Chat with Sara Khan.txt");
    expect(part.title).toBe("Sara Khan");
    expect(part.participants.sort()).toEqual(["Omar (Agent)", "Sara Khan"]);
    const [sys, first, reply, media, deleted] = part.messages;
    expect(sys!.kind).toBe("system");
    expect(sys!.sender).toBeNull();
    expect(first!.text).toBe("Hi, I saw the 2BR in Dubai Marina\nis it still available?");
    expect(first!.at).toBe(at(2026, 3, 14, 9, 16));
    expect(reply!.kind).toBe("text");
    expect(media!.kind).toBe("media");
    expect(deleted!.kind).toBe("unsent");
  });

  it("reads US Android 12h (month first) and converts PM/AM", () => {
    const txt = "3/14/26, 2:05 PM - John: Hello\n3/15/26, 12:30 AM - Me: Hi John";
    const { part } = parseWhatsApp(txt, "chat.txt");
    expect(part.messages[0]!.at).toBe(at(2026, 3, 14, 14, 5));
    expect(part.messages[1]!.at).toBe(at(2026, 3, 15, 0, 30));
  });

  it("reads iPhone brackets with seconds, U+202F before PM and U+200E media marks", () => {
    const txt = [
      "[3/14/26, 2:05:09 PM] Mike Ross: ‎Messages and calls are end-to-end encrypted.",
      "[3/14/26, 2:06:10 PM] Mike Ross: Looking for a condo in Toronto under $900k",
      "[3/14/26, 2:07:00 PM] Mike Ross: ‎image omitted",
      "[3/14/26, 2:08:00 PM] Agent Lee: Sending options now ‎<This message was edited>",
    ].join("\n");
    const { part } = parseWhatsApp(txt, "_chat.txt", { title: "Mike Ross" });
    const [enc, ask, img, edited] = part.messages;
    expect(enc!.kind).toBe("system");
    expect(enc!.sender).toBeNull();
    expect(ask!.kind).toBe("text");
    expect(ask!.at).toBe(at(2026, 3, 14, 14, 6, 10));
    expect(img!.kind).toBe("media");
    expect(edited!.text).toBe("Sending options now");
  });

  it("reads German dotted dates", () => {
    const { part } = parseWhatsApp("24.12.25, 18:45 - Anna: Frohe Weihnachten", "x.txt");
    expect(part.messages[0]!.at).toBe(at(2025, 12, 24, 18, 45));
  });

  it("reads an Arabic phone export: Arabic digits, Arabic comma, ص/م and RLM marks", () => {
    const txt = [
      "‏١٤‏/٣‏/٢٠٢٦، ٢:٠٥ م - أحمد: مرحبا، أبحث عن فيلا في جزر أمواج",
      "‏١٤‏/٣‏/٢٠٢٦، ٢:٢٠ م - Agent: أهلا أحمد",
      "‏١٥‏/٣‏/٢٠٢٦، ٩:٠٠ ص - أحمد: <تم استبعاد الوسائط>",
    ].join("\n");
    const { part } = parseWhatsApp(txt, "دردشة واتساب مع أحمد.txt");
    expect(part.title).toBe("أحمد");
    expect(part.messages[0]!.at).toBe(at(2026, 3, 14, 14, 5));
    expect(part.messages[0]!.text).toContain("جزر أمواج");
    expect(part.messages[2]!.at).toBe(at(2026, 3, 15, 9, 0));
    expect(part.messages[2]!.kind).toBe("media");
  });

  it("reads year-first dates", () => {
    const { part } = parseWhatsApp("2026-03-14, 09:00 - A: hi\n2026-03-15, 10:00 - B: hey", "x.txt");
    expect(part.messages[1]!.at).toBe(at(2026, 3, 15, 10, 0));
  });

  it("applies the agent's time zone (Dubai, UTC+4)", () => {
    const { part } = parseWhatsApp("14/03/2026, 09:00 - A: hi", "x.txt", { timeZoneOffsetMinutes: 240 });
    expect(part.messages[0]!.at).toBe(at(2026, 3, 14, 5, 0));
  });

  it("decides day/month order from the whole file", () => {
    expect(inferDateOrder([{ a: 3, b: 4, c: 26 }, { a: 13, b: 4, c: 26 }], "mdy").order).toBe("dmy");
    expect(inferDateOrder([{ a: 3, b: 4, c: 26 }, { a: 3, b: 14, c: 26 }], "dmy").order).toBe("mdy");
    // Small numbers only: day-first reads 2 Mar then 1 Apr (forward in time),
    // month-first reads 3 Feb then 4 Jan (backward). Chats run forward, so day-first.
    expect(inferDateOrder([{ a: 2, b: 3, c: 26 }, { a: 1, b: 4, c: 26 }], "mdy").order).toBe("dmy");
    const tie = inferDateOrder([{ a: 3, b: 4, c: 26 }], "mdy");
    expect(tie).toEqual({ order: "mdy", ambiguous: true });
  });

  it("recognises WhatsApp text and chat names in file names", () => {
    expect(looksLikeWhatsApp("12/03/2023, 14:05 - John: Hi\n12/03/2023, 14:06 - Me: Yo")).toBe(true);
    expect(looksLikeWhatsApp("Dear diary,\ntoday I went out")).toBe(false);
    expect(titleFromFileName("exports/WhatsApp Chat - +971 50 123 4567.zip")).toBe("+971 50 123 4567");
  });
});
