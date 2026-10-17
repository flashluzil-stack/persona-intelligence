import type { NextRequest } from "next/server";
import { guard, jsonError } from "@/lib/api";
import { loadProjectBundle } from "@/lib/db/queries";
import { bibliographyMarkdown, profileMarkdown } from "@/lib/export/markdown";
import { uuidSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

function filename(name: string, part: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "profile"}-${part}.md`;
}

/** GET ?part=profile|report|bibliography&includeNotes=1 → Markdown download. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const g = await guard(request);
  if ("response" in g) return g.response;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return jsonError(404, "Not found.");
  const part = request.nextUrl.searchParams.get("part") ?? "report";
  if (!["profile", "report", "bibliography"].includes(part)) return jsonError(400, "Unknown export type.");
  const includeNotes = request.nextUrl.searchParams.get("includeNotes") === "1";

  const bundle = await loadProjectBundle(g.auth.supabase, id);
  if (!bundle) return jsonError(404, "Not found.");
  const personName = bundle.person?.displayName ?? bundle.project.input.fullName;

  let body: string;
  if (part === "bibliography") {
    const relevant = bundle.sources.filter((s) => s.relevance !== "unrelated");
    body = [`# Sources: ${personName}`, "", `_Accessed via Persona Intelligence. Last researched ${bundle.project.lastResearchedAt?.slice(0, 10) ?? "—"}._`, "", ...bibliographyMarkdown(relevant)].join("\n");
  } else {
    body = profileMarkdown(
      {
        personName,
        projectName: bundle.project.name,
        lastResearchedAt: bundle.project.lastResearchedAt,
        sections: bundle.sections,
        claims: bundle.claims,
        sources: bundle.sources,
        quality: bundle.jobs.find((j) => j.qualityReport)?.qualityReport ?? null,
        notes: includeNotes ? bundle.notes : undefined,
      },
      part as "profile" | "report",
    );
  }
  await g.auth.supabase.from("audit_events").insert({ user_id: g.auth.user.id, event_type: "export.profile", metadata: { projectId: id, part, includeNotes } });
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename(personName, part)}"`,
      "Cache-Control": "no-store",
    },
  });
}
