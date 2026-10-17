import { describe, expect, it } from "vitest";
import { buildPreview } from "@/lib/billing/preview";
import { DEMO_CLAIMS, DEMO_QUALITY, DEMO_SECTIONS, DEMO_SOURCES } from "@/lib/demo/fictional-profile";

const report = { sections: DEMO_SECTIONS, claims: DEMO_CLAIMS, sources: DEMO_SOURCES, quality: DEMO_QUALITY };
const preview = buildPreview(report, { findings: 3, keyPoints: 2 });
const serialized = JSON.stringify(preview);

/** Every string anywhere in a value. */
function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

describe("free preview payload (server-side paywall)", () => {
  it("contains none of the text of locked sections", () => {
    for (const s of DEMO_SECTIONS.filter((x) => x.sectionType !== "overview")) {
      const lockedText = allStrings(s.content).filter((t) => t.length > 25);
      expect(lockedText.length).toBeGreaterThan(0);
      // A quote may legitimately appear because it is also the verbatim evidence of a visible finding.
      const visibleEvidence = JSON.stringify(preview.claims);
      for (const t of lockedText.filter((x) => !visibleEvidence.includes(x))) expect(serialized).not.toContain(t);
    }
  });

  it("limits the overview to its summary, role and the first key points", () => {
    const overview = DEMO_SECTIONS.find((s) => s.sectionType === "overview")!;
    const full = overview.content as { key_points: Array<{ text: string }> };
    const shown = preview.overview!.content as { key_points: unknown[] };
    expect(shown.key_points).toHaveLength(Math.min(2, full.key_points.length));
    for (const kp of full.key_points.slice(2)) expect(serialized).not.toContain(kp.text);
    expect(preview.overview!.modelMetadata).toEqual({});
  });

  it("includes only a few findings, with sources limited to the ones they cite", () => {
    expect(preview.findings.length).toBeLessThanOrEqual(3);
    const cited = new Set(preview.claims.flatMap((c) => c.evidence.map((e) => e.sourceId)));
    expect(preview.sources.every((s) => cited.has(s.id))).toBe(true);
    expect(preview.sources.length).toBeLessThan(DEMO_SOURCES.length);
    expect(preview.sources.every((s) => s.contentText === null)).toBe(true);
    // Claims not shown are not sent either.
    const visible = new Set(preview.claims.map((c) => c.id));
    for (const c of DEMO_CLAIMS.filter((x) => !visible.has(x.id))) expect(serialized).not.toContain(c.claimText);
  });

  it("describes locked sections only with genuine counts", () => {
    const bg = preview.locked.find((c) => c.key === "background")!;
    const content = DEMO_SECTIONS.find((s) => s.sectionType === "background")!.content as { positions: unknown[] };
    expect(bg.counts[0]).toEqual({ kind: "positions", n: content.positions.length });
    const evidence = preview.locked.find((c) => c.key === "evidence")!;
    expect(evidence.counts[0].n).toBe(DEMO_CLAIMS.length - preview.findings.length);
    expect(preview.locked.map((c) => c.key)).toEqual(["background", "interests", "communication", "values", "relationships", "recent", "open_questions", "evidence", "sources", "meeting"]);
  });

  it("marks sections with no evidence as limited and missing sections as missing", () => {
    const sparse = buildPreview({ ...report, sections: DEMO_SECTIONS.filter((s) => s.sectionType === "overview") }, { findings: 3, keyPoints: 2 });
    expect(sparse.locked.find((c) => c.key === "background")!.status).toBe("missing");
    const empty = buildPreview({ sections: [], claims: [], sources: [], quality: null }, { findings: 3, keyPoints: 2 });
    expect(empty.overview).toBeNull();
    expect(empty.locked.find((c) => c.key === "evidence")!.status).toBe("missing");
    expect(empty.locked.find((c) => c.key === "sources")!.status).toBe("limited");
  });
});
