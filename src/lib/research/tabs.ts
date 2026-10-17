/** Report tab ids. Shared by server pages and client components (kept out of "use client" modules). */
export const PROFILE_TAB_IDS = [
  "overview",
  "background",
  "interests",
  "communication",
  "visual_style",
  "values",
  "relationships",
  "recent",
  "open_questions",
  "evidence",
  "sources",
  "quality",
] as const;
export type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];
