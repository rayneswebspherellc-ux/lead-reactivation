const utf8Strict = new TextDecoder("utf-8", { fatal: true });

/**
 * Meta (Instagram, Facebook) JSON exports write UTF-8 bytes as if each byte
 * were a Latin-1 character, so "é" arrives as "Ã©" and emoji as "ð\u009f...".
 * Re-read those bytes as UTF-8. Text that is genuinely Latin-1 (a lone "é")
 * is not valid UTF-8 and is returned unchanged.
 */
export function fixMojibake(s: string): string {
  if (!/[\u0080-ÿ]/.test(s)) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) return s;
    bytes[i] = c;
  }
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return s;
  }
}

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9. Arabic-language phones export dates this way. */
export function toAsciiDigits(s: string): string {
  return s.replace(ARABIC_INDIC, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/** Direction marks, zero-width characters and BOMs that exports sprinkle into text. */
export function stripInvisible(s: string): string {
  return s.replace(/[‎‏‪-‮⁦-⁩﻿​]/g, "");
}

/** Narrow and regular no-break spaces (iOS puts U+202F before AM/PM) to plain spaces. */
export function normaliseSpaces(s: string): string {
  return s.replace(/[   ]/g, " ");
}

/** Name key for matching the same person across threads: case, accents and spacing ignored. */
export function nameKey(name: string): string {
  return stripInvisible(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode file bytes: handles UTF-8 (with or without BOM) and UTF-16 with BOM. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,}\d/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Digits only, with a leading + kept when present. 00 prefix becomes +. */
export function normalisePhone(raw: string): string | null {
  const s = toAsciiDigits(raw).trim();
  const plus = s.startsWith("+") || s.startsWith("00");
  const digits = s.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (plus ? "+" : "") + digits;
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of toAsciiDigits(text).matchAll(PHONE_RE)) {
    const p = normalisePhone(m[0]);
    if (p) out.add(p);
  }
  return [...out];
}

export function extractEmails(text: string): string[] {
  return [...new Set([...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()))];
}

/** Small, fast, non-cryptographic hash (FNV-1a) for spotting duplicate files. */
export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ":" + bytes.length;
}
