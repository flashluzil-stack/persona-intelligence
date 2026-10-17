import { randomUUID } from "node:crypto";
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
import type { ResearchInput } from "@/lib/validation/schemas";

/** In-memory ResearchStore used by integration tests (no database, no network). */
export class MemoryStore implements ResearchStore {
  projects = new Map<string, ProjectRow>();
  jobs = new Map<string, JobRow>();
  sources = new Map<string, SourceRecord & { projectId: string }>();
  claims = new Map<string, ClaimRow>();
  sections: SectionRow[] = [];
  persons = new Map<string, { id: string; projectId: string; displayName: string; identityStatus: string }>();
  usage: UsageRecord[] = [];
  auditLog: Array<{ eventType: string; metadata: Record<string, unknown> }> = [];

  seed(input: ResearchInput, userId = "user-1"): { project: ProjectRow; job: JobRow } {
    const now = new Date().toISOString();
    const project: ProjectRow = {
      id: randomUUID(),
      userId,
      name: input.fullName,
      researchObjective: null,
      input,
      status: "queued",
      personId: null,
      lastResearchedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const job: JobRow = {
      id: randomUUID(),
      userId,
      projectId: project.id,
      kind: "initial",
      status: "queued",
      currentStage: null,
      progress: [],
      identity: {},
      errorDetails: null,
      qualityReport: null,
      usage: {},
      heartbeatAt: null,
      startedAt: null,
      completedAt: null,
      createdAt: now,
    };
    this.projects.set(project.id, project);
    this.jobs.set(job.id, job);
    return { project, job };
  }

  async getProject(id: string) {
    return structuredClone(this.projects.get(id) ?? null);
  }
  async getJob(id: string) {
    return structuredClone(this.jobs.get(id) ?? null);
  }
  async updateJob(id: string, patch: Partial<JobRow>) {
    const job = this.jobs.get(id);
    if (job) Object.assign(job, structuredClone(patch));
  }
  async updateProject(id: string, patch: Partial<ProjectRow>) {
    const p = this.projects.get(id);
    if (p) Object.assign(p, patch, { updatedAt: new Date().toISOString() });
  }
  async ensurePerson(project: ProjectRow, attrs: { displayName: string; identityStatus: string }) {
    const existing = [...this.persons.values()].find((p) => p.projectId === project.id);
    if (existing) return existing.id;
    const id = randomUUID();
    this.persons.set(id, { id, projectId: project.id, displayName: attrs.displayName, identityStatus: attrs.identityStatus });
    return id;
  }
  async upsertSources(projectId: string, _jobId: string, sources: NewSource[]) {
    const out: SourceRecord[] = [];
    for (const s of sources) {
      const existing = [...this.sources.values()].find((x) => x.projectId === projectId && x.normalizedUrl === s.normalizedUrl);
      if (existing) {
        existing.excerpt = s.excerpt ?? existing.excerpt;
        out.push(structuredClone(existing));
        continue;
      }
      const record = { ...structuredClone(s), id: randomUUID(), projectId };
      this.sources.set(record.id, record);
      out.push(structuredClone(record));
    }
    return out;
  }
  async updateSource(id: string, patch: Partial<NewSource>) {
    const s = this.sources.get(id);
    if (s) Object.assign(s, patch);
  }
  async listSources(projectId: string) {
    return [...this.sources.values()].filter((s) => s.projectId === projectId).map((s) => structuredClone(s));
  }
  async insertClaims(projectId: string, jobId: string, personId: string | null, claims: NewClaim[]) {
    return claims.map((c) => {
      const id = randomUUID();
      const row: ClaimRow = {
        ...structuredClone(c),
        id,
        projectId,
        jobId,
        personId,
        createdAt: new Date().toISOString(),
        evidence: c.evidence.map((e) => ({ ...e, id: randomUUID(), claimId: id })),
      };
      this.claims.set(id, row);
      return structuredClone(row);
    });
  }
  async deleteJobClaims(jobId: string) {
    for (const [id, c] of this.claims) if (c.jobId === jobId) this.claims.delete(id);
  }
  async listClaims(projectId: string, jobId: string) {
    return [...this.claims.values()].filter((c) => c.projectId === projectId && c.jobId === jobId).map((c) => structuredClone(c));
  }
  async saveSections(projectId: string, personId: string | null, jobId: string, sections: NewSection[]) {
    const saved: SectionRow[] = [];
    for (const s of sections) {
      const prev = this.sections.find((x) => x.projectId === projectId && x.sectionType === s.sectionType && x.isCurrent);
      if (prev) prev.isCurrent = false;
      const row: SectionRow = {
        id: randomUUID(),
        projectId,
        personId,
        jobId,
        sectionType: s.sectionType,
        content: structuredClone(s.content),
        version: (prev?.version ?? 0) + 1,
        isCurrent: true,
        userOverride: prev?.userOverride ?? null,
        userOverrideAt: prev?.userOverrideAt ?? null,
        generatedAt: new Date().toISOString(),
        modelMetadata: s.modelMetadata,
      };
      this.sections.push(row);
      saved.push(row);
    }
    return saved;
  }
  async listCurrentSections(projectId: string) {
    return this.sections.filter((s) => s.projectId === projectId && s.isCurrent);
  }
  async recordUsage(_jobId: string, usage: UsageRecord[]) {
    this.usage.push(...usage);
  }
  async audit(eventType: string, metadata: Record<string, unknown>) {
    this.auditLog.push({ eventType, metadata });
  }
}
