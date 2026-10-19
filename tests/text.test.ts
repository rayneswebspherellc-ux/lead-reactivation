import { describe, expect, it } from "vitest";
import { readCsv } from "../src/lib/csv";
import { extractEmails, extractPhones, fixMojibake, toAsciiDigits } from "../src/lib/text";
import { metaEncode } from "./helpers";

describe("text helpers", () => {
  it("repairs Meta mojibake for accents, Arabic and emoji", () => {
    for (const s of ["Café Marina", "شقة في دبي مارينا", "Thanks 🙏🏽 see you", "Zoë – 2BR"]) {
      expect(fixMojibake(metaEncode(s))).toBe(s);
    }
  });

  it("leaves genuine Latin-1 and plain text alone", () => {
    expect(fixMojibake("café")).toBe("café");
    expect(fixMojibake("hello")).toBe("hello");
  });

  it("converts Arabic-Indic and Persian digits", () => {
    expect(toAsciiDigits("١٢/٣/٢٠٢٣")).toBe("12/3/2023");
    expect(toAsciiDigits("۰۹۸")).toBe("098");
  });

  it("finds phones and emails in a message", () => {
    expect(extractPhones("call me on +971 50 123 4567 or 00973-3612-3456")).toEqual([
      "+971501234567",
      "+97336123456",
    ]);
    expect(extractPhones("budget is 1,500,000 AED")).toEqual([]);
    expect(extractEmails("mail Sara.K@Example.com please")).toEqual(["sara.k@example.com"]);
  });

  it("reads CSV with quoted commas, quotes and line breaks", () => {
    const rows = [...readCsv('a,b,c\n1,"x, y","he said ""hi""\nsecond line"\r\n2,,end\n')];
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'he said "hi"\nsecond line'],
      ["2", "", "end"],
    ]);
  });
});
