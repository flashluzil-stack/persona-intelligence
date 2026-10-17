import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClaimRow,
  JobRow,
  NewClaim,
  NewSection,
  NewSource,
  ProjectRow,
  ResearchStore,
  SectionRow,
} from "@/lib/research/store";
import type { SourceRecord, UsageRecord } from "@/lib/research/types";
import { jobPatchToRow, mapClaim, mapJob, mapProject, mapSection, mapSource, sourceToRow } from "./mappers";

export class DatabaseError extends Error {
  constructor(operation: string, cause?: { message?: string; code?: string }) {
    // Log details server-side; surface only the operation name.
    if (cause) console.error(`[db] ${operation} failed`, cause.code, cause.message);
    super(`Database operation failed: ${operation}`);
    this.name = "DatabaseError";
  }
}

function must<T>(operation: string, result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new DatabaseError(operation, result.error);
  return result.data as T;
}

const SOURCE_COLUMNS =
  "id, url, normalized_url, title, domain, source_type, author, published_at, accessed_at, excerpt, content_text, retrieval_status, retrieval_note, relevance, provider, metadata";

/**
 * ResearchStore backed by Supabase. Constructed with a client that carries
 * the user's JWT, so every statement is subject to Row Level Security. The
 * explicit user_id values written here must match auth.uid() or RLS rejects them.
 */
export class SupabaseResearchStore implements ResearchStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
  ) {}

  async getProject(projectId: string): Promise<ProjectRow | null> {
    const data = must("load project", await this.db.from("research_projects").select("*").eq("id", projectId).maybeSingle());
    return data ? mapProject(data) : null;
  }

  async getJob(jobId: string): Promise<JobRow | null> {
    const data = must("load job", await this.db.from("research_jobs").select("*").eq("id", jobId).maybeSingle());
    return data ? mapJob(data) : null;
  }

  async updateJob(jobId: string, patch: Partial<JobRow>): Promise<void> {
    must("update job", await this.db.from("research_jobs").update(jobPatchToRow(patch)).eq("id", jobId));
  }

  async updateProject(projectId: string, patch: Partial<Pick<ProjectRow, "status" | "personId" | "lastResearchedAt">>) {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.personId !== undefined) row.person_id = patch.personId;
    if (patch.lastResearchedAt !== undefined) row.last_researched_at = patch.lastResearchedAt;
    must("update project", await this.db.from("research_projects").update(row).eq("id", projectId));
  }

  async ensurePerson(
    project: ProjectRow,
    attrs: { displayName: string; description: string | null; identityStatus: string; attributes: Record<string, unknown> },
  ): Promise<string> {
    const existing = must<{ id: string } | null>(
      "load person",
      await this.db.from("persons").select("id").eq("research_project_id", project.id).limit(1).maybeSingle(),
    );
    const row = {
      display_name: attrs.displayName,
      public_description: attrs.description?.slice(0, 2000) ?? null,
      identity_status: attrs.identityStatus,
      normalized_attributes: attrs.attributes,
    };
    if (existing) {
      must("update person", await this.db.from("persons").update(row).eq("id", existing.id));
      return existing.id as string;
    }
    const created = must<{ id: string }>(
      "create person",
      await this.db
        .from("persons")
        .insert({ ...row, user_id: this.userId, research_project_id: project.id })
        .select("id")
        .single(),
    );
    const identifiers = Object.entries({
      company: project.input.company,
      role: project.input.role,
      location: project.input.location,
      profile_url: project.input.profileUrl,
    })
      .filter(([, v]) => Boolean(v))
      .map(([type, value]) => ({
        user_id: this.userId,
        person_id: created.id,
        identifier_type: type,
        value,
        verification_status: "user_supplied",
      }));
    if (identifiers.length) must("save identifiers", await this.db.from("person_identifiers").insert(identifiers));
    return created.id as string;
  }

  async upsertSources(projectId: string, jobId: string, sources: NewSource[]): Promise<SourceRecord[]> {
    if (sources.length === 0) return [];
    const rows = sources.map((s) => ({ ...sourceToRow(s), user_id: this.userId, research_project_id: projectId, job_id: jobId }));
    // ignoreDuplicates keeps earlier retrieval results; existing rows are returned by the select below.
    must(
      "save sources",
      await this.db.from("sources").upsert(rows, { onConflict: "research_project_id,normalized_url", ignoreDuplicates: true }),
    );
    const data = must(
      "load sources",
      await this.db
        .from("sources")
        .select(SOURCE_COLUMNS)
        .eq("research_project_id", projectId)
        .in("normalized_url", sources.map((s) => s.normalizedUrl)),
    );
    const byUrl = new Map((data as Record<string, unknown>[]).map((r) => [r.normalized_url as string, mapSource(r)]));
    return sources.map((s) => byUrl.get(s.normalizedUrl)).filter((s): s is SourceRecord => Boolean(s));
  }

  async updateSource(sourceId: string, patch: Partial<NewSource>): Promise<void> {
    must("update source", await this.db.from("sources").update(sourceToRow(patch)).eq("id", sourceId));
  }

  async listSources(projectId: string): Promise<SourceRecord[]> {
    const data = must(
      "list sources",
      await this.db.from("sources").select(SOURCE_COLUMNS).eq("research_project_id", projectId).order("created_at"),
    );
    return (data as Record<string, unknown>[]).map(mapSource);
  }

  async insertClaims(projectId: string, jobId: string, personId: string | null, claims: NewClaim[]): Promise<ClaimRow[]> {
    if (claims.length === 0) return [];
    const inserted = must(
      "save claims",
      await this.db
        .from("claims")
        .insert(
          claims.map((c) => ({
            user_id: this.userId,
            person_id: personId,
            research_project_id: projectId,
            job_id: jobId,
            claim_text: c.claimText,
            category: c.category,
            evidence_type: c.evidenceType,
            confidence_label: c.confidenceLabel,
            confidence_rationale: c.confidenceRationale,
            verification_status: c.verificationStatus,
            temporal_status: c.temporalStatus,
            conflict_group: c.conflictGroup,
            limitations: c.limitations,
            first_observed_date: c.firstObservedDate,
            last_observed_date: c.lastObservedDate,
          })),
        )
        .select("id"),
    ) as Array<{ id: string }>;
    const evidenceRows = claims.flatMap((c, i) =>
      c.evidence.map((e) => ({
        user_id: this.userId,
        claim_id: inserted[i].id,
        source_id: e.sourceId,
        supporting_excerpt: e.supportingExcerpt.slice(0, 2000),
        evidence_relationship: e.relationship,
        source_credibility: e.sourceCredibility,
        support_strength: e.supportStrength,
        notes: e.notes,
      })),
    );
    if (evidenceRows.length) must("save evidence", await this.db.from("claim_evidence").insert(evidenceRows));
    return this.listClaims(projectId, jobId);
  }

  async deleteJobClaims(jobId: string): Promise<void> {
    must("delete claims", await this.db.from("claims").delete().eq("job_id", jobId));
  }

  async listClaims(projectId: string, jobId: string): Promise<ClaimRow[]> {
    const data = must(
      "list claims",
      await this.db
        .from("claims")
        .select("*, claim_evidence(*)")
        .eq("research_project_id", projectId)
        .eq("job_id", jobId)
        .order("created_at"),
    );
    return (data as Record<string, unknown>[]).map(mapClaim);
  }

  async saveSections(projectId: string, personId: string | null, jobId: string, sections: NewSection[]): Promise<SectionRow[]> {
    const data = must(
      "save profile sections",
      await this.db.rpc("save_profile_sections", {
        p_project_id: projectId,
        p_person_id: personId,
        p_job_id: jobId,
        p_sections: sections.map((s) => ({
          section_type: s.sectionType,
          structured_content: s.content,
          model_metadata: s.modelMetadata,
        })),
      }),
    );
    return (data as Record<string, unknown>[]).map(mapSection);
  }

  async listCurrentSections(projectId: string): Promise<SectionRow[]> {
    const data = must(
      "list sections",
      await this.db.from("profile_sections").select("*").eq("research_project_id", projectId).eq("is_current", true),
    );
    return (data as Record<string, unknown>[]).map(mapSection);
  }

  async recordUsage(jobId: string, usage: UsageRecord[]): Promise<void> {
    if (usage.length === 0) return;
    must(
      "record usage",
      await this.db.from("usage_events").insert(
        usage.map((u) => ({
          user_id: this.userId,
          job_id: jobId,
          kind: u.kind,
          provider: u.provider,
          units: u.units,
          input_tokens: u.inputTokens ?? null,
          output_tokens: u.outputTokens ?? null,
        })),
      ),
    );
  }

  async audit(eventType: string, metadata: Record<string, unknown>): Promise<void> {
    // Audit failures must never break user flows.
    const { error } = await this.db.from("audit_events").insert({ user_id: this.userId, event_type: eventType, metadata });
    if (error) console.error("[audit] insert failed", error.code);
  }
}
