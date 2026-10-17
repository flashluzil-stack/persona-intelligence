import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredMeetingBrief } from "@/lib/research/meeting";
import type { ClaimRow, JobRow, ProjectRow, SectionRow } from "@/lib/research/store";
import type { SourceRecord } from "@/lib/research/types";
import { DatabaseError } from "./supabase-store";
import { mapClaim, mapJob, mapProject, mapSection, mapSource } from "./mappers";

export interface NoteRow {
  id: string;
  sectionType: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface BriefRow {
  id: string;
  projectId: string;
  objective: string;
  context: Record<string, unknown>;
  brief: StoredMeetingBrief;
  modelMetadata: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectListItem extends ProjectRow {
  latestJob: Pick<JobRow, "id" | "status" | "currentStage" | "createdAt" | "completedAt" | "errorDetails"> | null;
}

const mapBrief = (r: Record<string, unknown>): BriefRow => ({
  id: r.id as string,
  projectId: r.research_project_id as string,
  objective: r.objective as string,
  context: (r.context as Record<string, unknown>) ?? {},
  brief: r.structured_brief as StoredMeetingBrief,
  modelMetadata: (r.model_metadata as Record<string, unknown>) ?? {},
  createdAt: r.created_at as string,
});

export async function listProjects(db: SupabaseClient, limit = 50): Promise<ProjectListItem[]> {
  const { data, error } = await db
    .from("research_projects")
    .select("*, research_jobs(id, status, current_stage, created_at, completed_at, error_details)")
    .order("updated_at", { ascending: false })
    .order("created_at", { referencedTable: "research_jobs", ascending: false })
    .limit(limit);
  if (error) throw new DatabaseError("list projects", error);
  return (data ?? []).map((r) => {
    const jobs = (r.research_jobs as Record<string, unknown>[]) ?? [];
    const latest = jobs[0];
    return {
      ...mapProject(r),
      latestJob: latest
        ? {
            id: latest.id as string,
            status: latest.status as JobRow["status"],
            currentStage: latest.current_stage as JobRow["currentStage"],
            createdAt: latest.created_at as string,
            completedAt: (latest.completed_at as string | null) ?? null,
            errorDetails: (latest.error_details as JobRow["errorDetails"]) ?? null,
          }
        : null,
    };
  });
}

export async function listRecentBriefs(db: SupabaseClient, limit = 8) {
  const { data, error } = await db
    .from("meeting_briefs")
    .select("id, research_project_id, objective, created_at, research_projects(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new DatabaseError("list briefs", error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.research_project_id as string,
    objective: r.objective as string,
    createdAt: r.created_at as string,
    projectName: ((r.research_projects as unknown as { name?: string } | null)?.name ?? "Untitled") as string,
  }));
}

export interface ProjectBundle {
  project: ProjectRow;
  jobs: JobRow[];
  latestJob: JobRow | null;
  sources: SourceRecord[];
  sections: SectionRow[];
  claims: ClaimRow[];
  notes: NoteRow[];
  briefs: BriefRow[];
  person: { id: string; displayName: string; identityStatus: string; description: string | null } | null;
}

/** Loads everything the profile workspace needs. RLS guarantees ownership; a foreign id yields null. */
export async function loadProjectBundle(db: SupabaseClient, projectId: string): Promise<ProjectBundle | null> {
  const { data: projectRow, error } = await db.from("research_projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw new DatabaseError("load project", error);
  if (!projectRow) return null;
  const project = mapProject(projectRow);

  const [jobsRes, sourcesRes, sectionsRes, notesRes, briefsRes, personRes] = await Promise.all([
    db.from("research_jobs").select("*").eq("research_project_id", projectId).order("created_at", { ascending: false }),
    db
      .from("sources")
      .select("id, url, normalized_url, title, domain, source_type, author, published_at, accessed_at, excerpt, retrieval_status, retrieval_note, relevance, provider, metadata")
      .eq("research_project_id", projectId)
      .order("published_at", { ascending: false, nullsFirst: false }),
    db.from("profile_sections").select("*").eq("research_project_id", projectId).eq("is_current", true),
    db.from("user_notes").select("id, section_type, content, created_at, updated_at").eq("research_project_id", projectId).order("created_at", { ascending: false }),
    db.from("meeting_briefs").select("*").eq("research_project_id", projectId).order("created_at", { ascending: false }),
    project.personId
      ? db.from("persons").select("id, display_name, identity_status, public_description").eq("id", project.personId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [jobsRes, sourcesRes, sectionsRes, notesRes, briefsRes]) {
    if (r.error) throw new DatabaseError("load project data", r.error);
  }
  const jobs = (jobsRes.data ?? []).map(mapJob);
  const sections = (sectionsRes.data ?? []).map(mapSection);
  const claimJobId =
    sections.find((s) => s.sectionType === "overview")?.jobId ??
    jobs.find((j) => j.status === "completed" || j.status === "partial")?.id ??
    null;
  let claims: ClaimRow[] = [];
  if (claimJobId) {
    const { data, error: claimsError } = await db
      .from("claims")
      .select("*, claim_evidence(*)")
      .eq("research_project_id", projectId)
      .eq("job_id", claimJobId)
      .order("created_at");
    if (claimsError) throw new DatabaseError("load claims", claimsError);
    claims = (data ?? []).map(mapClaim);
  }
  const person = personRes.data
    ? {
        id: personRes.data.id as string,
        displayName: personRes.data.display_name as string,
        identityStatus: personRes.data.identity_status as string,
        description: (personRes.data.public_description as string | null) ?? null,
      }
    : null;

  return {
    project,
    jobs,
    latestJob: jobs[0] ?? null,
    sources: (sourcesRes.data ?? []).map((r) => mapSource({ ...r, content_text: null })),
    sections,
    claims,
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id as string,
      sectionType: (n.section_type as string | null) ?? null,
      content: n.content as string,
      createdAt: n.created_at as string,
      updatedAt: n.updated_at as string,
    })),
    briefs: (briefsRes.data ?? []).map(mapBrief),
    person,
  };
}

export async function loadSectionHistory(db: SupabaseClient, projectId: string): Promise<SectionRow[]> {
  const { data, error } = await db
    .from("profile_sections")
    .select("*")
    .eq("research_project_id", projectId)
    .order("section_type")
    .order("version", { ascending: false });
  if (error) throw new DatabaseError("load history", error);
  return (data ?? []).map(mapSection);
}

export async function loadClaimsForJobs(db: SupabaseClient, projectId: string, jobIds: string[]): Promise<ClaimRow[]> {
  if (jobIds.length === 0) return [];
  const { data, error } = await db
    .from("claims")
    .select("*, claim_evidence(*)")
    .eq("research_project_id", projectId)
    .in("job_id", jobIds);
  if (error) throw new DatabaseError("load claims", error);
  return (data ?? []).map(mapClaim);
}

export async function loadClaimsByIds(db: SupabaseClient, ids: string[]): Promise<ClaimRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("claims").select("*, claim_evidence(*)").in("id", ids.slice(0, 300));
  if (error) throw new DatabaseError("load claims", error);
  return (data ?? []).map(mapClaim);
}

export async function loadSourcesByIds(db: SupabaseClient, ids: string[]): Promise<SourceRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("sources")
    .select("id, url, normalized_url, title, domain, source_type, author, published_at, accessed_at, excerpt, retrieval_status, retrieval_note, relevance, provider, metadata")
    .in("id", ids.slice(0, 300));
  if (error) throw new DatabaseError("load sources", error);
  return (data ?? []).map((r) => mapSource({ ...r, content_text: null }));
}

export interface BriefBundle {
  brief: BriefRow;
  project: ProjectRow;
  claims: ClaimRow[];
  sources: SourceRecord[];
}

/** Loads a brief with exactly the claims and sources it cites. */
export async function loadBriefBundle(db: SupabaseClient, briefId: string): Promise<BriefBundle | null> {
  const { data, error } = await db.from("meeting_briefs").select("*").eq("id", briefId).maybeSingle();
  if (error) throw new DatabaseError("load brief", error);
  if (!data) return null;
  const brief = mapBrief(data);
  const { data: projectRow } = await db.from("research_projects").select("*").eq("id", brief.projectId).maybeSingle();
  if (!projectRow) return null;
  const b = brief.brief;
  const claimIds = [
    ...b.key_facts,
    ...b.conversation_topics,
    ...b.questions,
    ...b.professional_overlap,
    ...b.recent_developments,
    ...b.documented_risks,
  ].flatMap((i) => i.claim_ids);
  const claims = await loadClaimsByIds(db, [...new Set(claimIds)]);
  const sources = await loadSourcesByIds(db, [...new Set(claims.flatMap((c) => c.evidence.map((e) => e.sourceId)))]);
  return { brief, project: mapProject(projectRow), claims, sources };
}
