import type { ClaimRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";

/**
 * Assigns stable bibliography numbers to sources in order of first citation,
 * so exported documents and print views share the same numbering.
 */
export class CitationIndex {
  private readonly numbers = new Map<string, number>();
  private readonly order: SourceRecord[] = [];
  private readonly sources: Map<string, SourceRecord>;
  private readonly claims: Map<string, ClaimRow>;

  constructor(sources: SourceRecord[], claims: ClaimRow[]) {
    this.sources = new Map(sources.map((s) => [s.id, s]));
    this.claims = new Map(claims.map((c) => [c.id, c]));
  }

  claim(id: string): ClaimRow | undefined {
    return this.claims.get(id);
  }

  source(id: string): SourceRecord | undefined {
    return this.sources.get(id);
  }

  numberFor(sourceId: string): number | null {
    const source = this.sources.get(sourceId);
    if (!source) return null;
    let n = this.numbers.get(sourceId);
    if (!n) {
      n = this.order.length + 1;
      this.numbers.set(sourceId, n);
      this.order.push(source);
    }
    return n;
  }

  sourceIdsForClaims(claimIds: string[]): string[] {
    const ids: string[] = [];
    for (const cid of claimIds) {
      for (const e of this.claims.get(cid)?.evidence ?? []) if (!ids.includes(e.sourceId)) ids.push(e.sourceId);
    }
    return ids;
  }

  citeSources(sourceIds: string[]): string {
    const nums = sourceIds.map((id) => this.numberFor(id)).filter((n): n is number => n !== null);
    return nums.length ? nums.map((n) => `[${n}]`).join("") : "";
  }

  citeClaims(claimIds: string[]): string {
    return this.citeSources(this.sourceIdsForClaims(claimIds));
  }

  bibliography(): SourceRecord[] {
    return [...this.order];
  }
}
