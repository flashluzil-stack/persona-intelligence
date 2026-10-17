"use client";

import { Check, Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import { formatDate } from "@/i18n/format";
import { useI18n } from "@/i18n/provider";
import { apiRequest } from "@/lib/utils/client-api";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be unavailable (permissions/insecure context).
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? t.common.copied : (label ?? t.common.copy)}</span>
    </Button>
  );
}

/** Edit the section summary (stored separately from generated content) and regenerate the section. */
export function SectionActions({
  projectId,
  sectionType,
  currentOverride,
  generatedSummary,
  canRegenerate,
}: {
  projectId: string;
  sectionType: string;
  currentOverride: string | null;
  generatedSummary: string;
  canRegenerate: boolean;
}) {
  const { t } = useI18n();
  const a = t.actions;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(currentOverride ?? generatedSummary);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [regenerating, setRegenerating] = useState(false);

  const save = (value: string) =>
    startTransition(async () => {
      setError(null);
      const res = await apiRequest(`/api/research/${projectId}/sections/${sectionType}/override`, "PUT", { text: value });
      if (!res.ok) return setError(res.error);
      setEditing(false);
      setMessage(value ? a.savedEdit : a.removedEdit);
      router.refresh();
    });

  const regenerate = async () => {
    setError(null);
    setMessage(null);
    setRegenerating(true);
    const res = await apiRequest<{ insufficient: string[] }>(`/api/research/${projectId}/sections/${sectionType}/regenerate`, "POST");
    setRegenerating(false);
    if (!res.ok) return setError(res.error);
    setMessage(a.regenerated);
    router.refresh();
  };

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {generatedSummary && <CopyButton text={currentOverride ?? generatedSummary} label={a.copySummary} />}
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <Pencil aria-hidden />
          {currentOverride ? a.editSummary : a.writeSummary}
        </Button>
        {canRegenerate && (
          <Button variant="ghost" size="sm" onClick={regenerate} disabled={regenerating}>
            <RefreshCw aria-hidden className={regenerating ? "animate-spin" : undefined} />
            {regenerating ? a.regenerating : a.regenerate}
          </Button>
        )}
      </div>
      {editing && (
        <div className="space-y-2 rounded-md border border-line bg-paper-sunken p-3">
          <label htmlFor={`override-${sectionType}`} className="text-[13px] font-medium text-ink">
            {a.overrideLabel}
          </label>
          <Textarea id={`override-${sectionType}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={10_000} rows={5} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(text)} disabled={pending || !text.trim()}>
              {t.common.save}
            </Button>
            {currentOverride && (
              <Button size="sm" variant="secondary" onClick={() => save("")} disabled={pending}>
                {a.removeEdit}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      {message && <Notice tone="success" role="status">{message}</Notice>}
    </div>
  );
}

export function NotesPanel({
  projectId,
  notes,
}: {
  projectId: string;
  notes: Array<{ id: string; content: string; sectionType: string | null; createdAt: string; updatedAt: string }>;
}) {
  const { t, locale } = useI18n();
  const a = t.actions;
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error: string | null }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error);
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Notice tone="info">
        {a.notesNotice}
      </Notice>
      <div className="space-y-2">
        <label htmlFor="new-note" className="text-sm font-medium text-ink">
          {a.addNote}
        </label>
        <Textarea id="new-note" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={10_000} placeholder={a.notePlaceholder} />
        <Button size="sm" disabled={pending || !draft.trim()} onClick={() => act(() => apiRequest(`/api/research/${projectId}/notes`, "POST", { content: draft }), () => setDraft(""))}>
          {a.saveNote}
        </Button>
      </div>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-dashed border-line-strong bg-paper-raised px-4 py-3">
            <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              {a.yourNote(formatDate(n.updatedAt, locale))}
            </p>
            {editingId === n.id ? (
              <div className="space-y-2">
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} aria-label={a.editNoteAria} maxLength={10_000} />
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending || !editText.trim()} onClick={() => act(() => apiRequest(`/api/notes/${n.id}`, "PATCH", { content: editText }), () => setEditingId(null))}>
                    {t.common.save}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    {t.common.cancel}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p dir="auto" className="whitespace-pre-wrap text-[15px] text-ink">{n.content}</p>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(n.id); setEditText(n.content); }}>
                    <Pencil aria-hidden /> {t.common.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(a.deleteNoteConfirm)) act(() => apiRequest(`/api/notes/${n.id}`, "DELETE"));
                    }}
                  >
                    <Trash2 aria-hidden /> {t.common.delete}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeleteButton({ url, confirmText, redirectTo, label }: { url: string; confirmText: string; redirectTo: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (!confirm(confirmText)) return;
          setPending(true);
          const res = await apiRequest(url, "DELETE");
          setPending(false);
          if (!res.ok) return setError(res.error);
          router.push(redirectTo);
          router.refresh();
        }}
      >
        <Trash2 aria-hidden />
        {pending ? t.common.deleting : label}
      </Button>
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function RefreshResearchButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        onClick={async () => {
          if (!confirm(t.project.refreshConfirm)) return;
          setPending(true);
          const res = await apiRequest(`/api/research/${projectId}/refresh`, "POST");
          setPending(false);
          if (!res.ok) return setError(res.error);
          router.push(`/research/${projectId}?tab=workspace`);
          router.refresh();
        }}
      >
        <RefreshCw aria-hidden />
        {pending ? t.project.starting : t.project.refresh}
      </Button>
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    </div>
  );
}
