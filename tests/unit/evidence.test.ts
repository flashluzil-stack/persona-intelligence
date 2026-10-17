import { describe, expect, it } from "vitest";
import { assessConfidence, excerptFoundIn } from "@/lib/research/evidence";

describe("excerptFoundIn", () => {
  const text = "Maya Brenner is the Chief Data Officer at Northwind Analytics. She previously led analytics at Contoso — a retail company.";
  it("matches verbatim excerpts ignoring case, whitespace and quote styles", () => {
    expect(excerptFoundIn("maya brenner is the  Chief Data Officer", text)).toBe(true);
    expect(excerptFoundIn("She previously led analytics at Contoso - a retail company", text)).toBe(true);
  });
  it("supports ellipses between fragments in order", () => {
    expect(excerptFoundIn("Maya Brenner is the Chief Data Officer ... led analytics at Contoso", text)).toBe(true);
    expect(excerptFoundIn("led analytics at Contoso ... Maya Brenner is the Chief", text)).toBe(false);
  });
  it("rejects fabricated or paraphrased excerpts", () => {
    expect(excerptFoundIn("Maya Brenner is the CEO of Northwind Analytics", text)).toBe(false);
  });
  it("rejects trivially short excerpts", () => {
    expect(excerptFoundIn("Maya", text)).toBe(false);
  });
});

describe("assessConfidence", () => {
  const primary = { domain: "maya.com", credibility: "primary" as const, strength: "direct" as const, relationship: "supports" as const };
  const news = { domain: "reuters.com", credibility: "established_publication" as const, strength: "direct" as const, relationship: "supports" as const };
  const blog = { domain: "someblog.net", credibility: "secondary" as const, strength: "direct" as const, relationship: "supports" as const };
  const social = { domain: "x.com", credibility: "user_generated" as const, strength: "direct" as const, relationship: "supports" as const };

  it("gives high confidence to corroborated claims with a primary source", () => {
    const r = assessConfidence("documented_fact", [primary, news], false);
    expect(r.label).toBe("high");
    expect(r.verification).toBe("corroborated");
    expect(r.rationale).toMatch(/2 independent sources/);
  });

  it("never calls a single weak source verified", () => {
    const r = assessConfidence("secondary_report", [social], false);
    expect(r.label).toBe("low");
    expect(r.verification).toBe("single_source");
  });

  it("does not count two excerpts from the same domain as independent", () => {
    expect(assessConfidence("secondary_report", [blog, { ...blog }], false).label).toBe("low");
  });

  it("labels a single primary source as moderate", () => {
    expect(assessConfidence("documented_fact", [primary], false).label).toBe("moderate");
  });

  it("caps conflicting claims and says so", () => {
    const r = assessConfidence("documented_fact", [primary, news], true);
    expect(r.label).toBe("moderate");
    expect(r.verification).toBe("conflicting");
    expect(r.rationale).toMatch(/conflict/);
  });

  it("marks hypotheses and unsupported claims as insufficient evidence", () => {
    expect(assessConfidence("hypothesis", [primary], false).label).toBe("insufficient");
    expect(assessConfidence("documented_fact", [], false).label).toBe("insufficient");
    expect(assessConfidence("documented_fact", [{ ...blog, relationship: "context" }], false).label).toBe("insufficient");
  });

  it("keeps interpretations below documented facts", () => {
    expect(assessConfidence("interpretation", [primary, news], false).label).toBe("low");
  });

  it("treats self statements in primary sources as high confidence that they were said", () => {
    const r = assessConfidence("self_statement", [primary], false);
    expect(r.label).toBe("high");
    expect(r.rationale).toMatch(/own account/);
  });
});
