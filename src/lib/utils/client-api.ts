/** Minimal JSON client for same-origin API routes. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  fields: Record<string, string>;
}

export async function apiRequest<T = unknown>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (json as T) : null,
      error: res.ok ? null : typeof json.error === "string" ? json.error : `Request failed (${res.status}).`,
      fields: (json.fields as Record<string, string>) ?? {},
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error. Check your connection and try again.", fields: {} };
  }
}
