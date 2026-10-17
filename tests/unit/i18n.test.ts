import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLocale, LOCALE_META, negotiateLocale } from "@/i18n/config";
import { formatDate, formatMoney } from "@/i18n/format";
import { getLegal } from "@/i18n/legal";
import { getMessages } from "@/i18n/messages";

type Tree = Record<string, unknown>;

/** Flattens a dictionary to "path → kind" where kind captures functions and their arity. */
function shape(node: unknown, prefix = ""): Record<string, string> {
  if (typeof node === "function") return { [prefix]: `fn/${node.length}` };
  if (Array.isArray(node)) return { [prefix]: `array/${node.length}`, ...Object.assign({}, ...node.map((v, i) => shape(v, `${prefix}[${i}]`))) };
  if (node && typeof node === "object") return Object.assign({}, ...Object.entries(node as Tree).map(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k)));
  return { [prefix]: typeof node };
}

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (typeof node === "function") {
    const sample = (node as (...a: unknown[]) => unknown)(...Array.from({ length: node.length }, (_, i) => (i === 0 ? 2 : "X")));
    if (typeof sample === "string") out.push(sample);
  } else if (node && typeof node === "object") Object.values(node as Tree).forEach((v) => strings(v, out));
  return out;
}

const en = getMessages("en");
const he = getMessages("he");

describe("dictionaries", () => {
  it("Hebrew has exactly the same keys, arrays and function arities as English", () => {
    expect(shape(he)).toEqual(shape(en));
  });

  it("has no empty strings", () => {
    for (const s of [...strings(en), ...strings(he)]) expect(s.trim().length).toBeGreaterThan(0);
  });

  it("Hebrew strings are actually translated", () => {
    const all = strings(he);
    const hebrew = all.filter((s) => /[֐-׿]/.test(s));
    // Allow a handful of language-neutral strings (symbols, brand names).
    expect(hebrew.length / all.length).toBeGreaterThan(0.95);
  });

  it("never promises unlimited usage", () => {
    for (const s of [...strings(en), ...strings(he)]) {
      expect(s).not.toMatch(/\bunlimited\b(?! *:)/i);
      expect(s).not.toMatch(/ללא הגבלה/);
    }
  });

  it("legal documents have the same sections in both languages", () => {
    for (const doc of ["privacy", "terms"] as const) {
      const a = getLegal("en")[doc].sections.map((s) => [s.id, s.items.length]);
      const b = getLegal("he")[doc].sections.map((s) => [s.id, s.items.length]);
      expect(b).toEqual(a);
    }
  });
});

describe("locale negotiation and formatting", () => {
  it("negotiates from Accept-Language with English as the fallback", () => {
    expect(negotiateLocale("he-IL,he;q=0.9,en;q=0.8")).toBe("he");
    expect(negotiateLocale("en-US,he;q=0.5")).toBe("en");
    expect(negotiateLocale("fr-FR,he;q=0.4")).toBe("he");
    expect(negotiateLocale("fr-FR")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
    expect(isLocale("he")).toBe(true);
    expect(isLocale("xx")).toBe(false);
  });

  it("marks Hebrew as RTL and English as LTR", () => {
    expect(LOCALE_META.he.dir).toBe("rtl");
    expect(LOCALE_META.en.dir).toBe("ltr");
  });

  it("formats money and dates per locale", () => {
    expect(formatMoney(2900, "USD", "en")).toBe("US$29");
    expect(formatMoney(2417, "USD", "en")).toMatch(/24\.17/);
    expect(formatMoney(3900, "ILS", "he")).toMatch(/39/);
    expect(formatMoney(3900, "ILS", "he")).toMatch(/₪/);
    expect(formatDate("2026-10-02", "en")).toBe("2 Oct 2026");
    expect(formatDate("2026-10-02", "he")).toMatch(/2026/);
    expect(formatDate(null, "he", "—")).toBe("—");
  });
});

describe("no hardcoded UI strings in converted components", () => {
  // Visible English copy should come from the dictionaries. This catches regressions
  // such as a literal "Sign in" or "Save" placed directly in JSX text.
  const root = path.resolve(import.meta.dirname, "../../src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) files.push(full);
    }
  };
  walk(path.join(root, "components"));
  walk(path.join(root, "app"));

  it("JSX text nodes contain no English words", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/<code>[\s\S]*?<\/code>/g, "");
      // Text directly between a closing ">" and an opening "<" that contains letters.
      for (const m of src.matchAll(/>\s*([A-Za-z][A-Za-z ,.'’!?-]{2,})\s*</g)) {
        const text = m[1].trim();
        if (/^(Persona Intelligence|EN|PDF|Promise)$/.test(text)) continue;
        offenders.push(`${path.relative(root, file)}: "${text}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
