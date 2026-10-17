import { describe, expect, it } from "vitest";
import { fieldErrors, meetingBriefInputSchema, researchInputSchema } from "@/lib/validation/schemas";

describe("research input validation", () => {
  it("requires a full name", () => {
    const result = researchInputSchema.safeParse({ fullName: "  " });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).fullName).toMatch(/required/i);
  });

  it("rejects a missing name field", () => {
    expect(researchInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects names without letters", () => {
    expect(researchInputSchema.safeParse({ fullName: "12345" }).success).toBe(false);
  });

  it("accepts a minimal valid input and normalizes whitespace", () => {
    const result = researchInputSchema.parse({ fullName: "  Ada   Lovelace ", company: "", role: "  Analyst " });
    expect(result).toEqual({ fullName: "Ada Lovelace", role: "Analyst" });
  });

  it("accepts non-Latin names", () => {
    expect(researchInputSchema.safeParse({ fullName: "נועה כהן" }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
    "not a url",
  ])("rejects invalid or unsafe profile URL %s", (profileUrl) => {
    const result = researchInputSchema.safeParse({ fullName: "Ada Lovelace", profileUrl });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).profileUrl).toBeDefined();
  });

  it("accepts a public profile URL", () => {
    const result = researchInputSchema.parse({ fullName: "Ada Lovelace", profileUrl: "https://ada.example.org/about" });
    expect(result.profileUrl).toBe("https://ada.example.org/about");
  });

  it("rejects excessively long input", () => {
    expect(researchInputSchema.safeParse({ fullName: "A".repeat(121) }).success).toBe(false);
    expect(researchInputSchema.safeParse({ fullName: "Ada Lovelace", company: "x".repeat(161) }).success).toBe(false);
    expect(researchInputSchema.safeParse({ fullName: "Ada Lovelace", context: "x".repeat(1501) }).success).toBe(false);
    expect(researchInputSchema.safeParse({ fullName: "Ada Lovelace", profileUrl: `https://example.com/${"a".repeat(2100)}` }).success).toBe(false);
  });

  it("strips control characters", () => {
    const result = researchInputSchema.parse({ fullName: "Ada\u0000 Lovelace\u0007" });
    expect(result.fullName).toBe("Ada Lovelace");
  });

  it("rejects unknown research purposes", () => {
    expect(researchInputSchema.safeParse({ fullName: "Ada Lovelace", purpose: "stalking" }).success).toBe(false);
  });
});

describe("meeting brief input validation", () => {
  it("requires a supported objective", () => {
    expect(meetingBriefInputSchema.safeParse({}).success).toBe(false);
    expect(meetingBriefInputSchema.safeParse({ objective: "manipulation" }).success).toBe(false);
    expect(meetingBriefInputSchema.safeParse({ objective: "investor_meeting" }).success).toBe(true);
  });

  it("bounds the meeting duration", () => {
    expect(meetingBriefInputSchema.safeParse({ objective: "networking", durationMinutes: "2" }).success).toBe(false);
    expect(meetingBriefInputSchema.parse({ objective: "networking", durationMinutes: "45" }).durationMinutes).toBe(45);
  });
});
