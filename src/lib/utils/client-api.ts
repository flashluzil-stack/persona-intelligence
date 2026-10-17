import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/** Fallback messages follow the page language (<html lang>); API errors arrive already localized. */
function messages() {
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "en";
  return getMessages(isLocale(lang) ? lang : "en").errors;
}

/** Minimal JSON client for same-origin API routes. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  fields: Record<string, string>;
  code?: string | null;
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
      error: res.ok ? null : typeof json.error === "string" ? json.error : messages().requestFailed(res.status),
      fields: (json.fields as Record<string, string>) ?? {},
      code: typeof json.code === "string" ? json.code : null,
    };
  } catch {
    return { ok: false, status: 0, data: null, error: messages().network, fields: {} };
  }
}
