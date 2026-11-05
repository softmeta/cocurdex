import type {
  MemoryEntry,
  MemoryHistoryEntry,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton } from "@/components";
import { Button, Input, Label, Text, Textarea } from "@/components/ui";

function tagsText(tags: string[]) {
  return tags.join(", ");
}

function parseTags(text: string) {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function changedFields(
  entry: MemoryEntry,
  draft: { title: string; content: string; tags: string },
): MemoryUpdateInput | null {
  const input: MemoryUpdateInput = { id: entry.id };
  if (draft.title.trim() !== entry.title) input.title = draft.title.trim();
  if (draft.content !== entry.content) input.content = draft.content;
  const tags = parseTags(draft.tags);
  if (tagsText(tags) !== tagsText(entry.tags)) input.tags = tags;
  return Object.keys(input).length > 1 ? input : null;
}

export function MemoryEntryDetail({
  entry,
  history,
  canEdit,
  canForget,
  onSave,
  onForget,
}: {
  entry: MemoryEntry;
  history: MemoryHistoryEntry[] | null;
  canEdit: boolean;
  canForget: boolean;
  onSave: (input: MemoryUpdateInput) => Promise<void>;
  onForget: () => void;
}) {
  const { t, i18n } = useTranslation("memory");
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [tags, setTags] = useState(tagsText(entry.tags));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = changedFields(entry, { title, content, tags });
  const invalid = !title.trim() || !content.trim();
  const timeFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const formatTime = (value: string | null) => {
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? timeFormat.format(new Date(time)) : "";
  };
  const actionLabels: Record<string, string> = {
    create: t("library.action.create"),
    update: t("library.action.update"),
    delete: t("library.action.delete"),
    restore: t("library.action.restore"),
    merge: t("library.action.merge"),
  };

  const save = async () => {
    if (!changes || invalid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(changes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      aria-label={t("library.detail")}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      data-memory-id={entry.id}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="memory-entry-title">{t("library.title")}</Label>
        <Input
          id="memory-entry-title"
          readOnly={!canEdit}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex min-h-40 flex-1 flex-col gap-1.5">
        <Label htmlFor="memory-entry-content">{t("library.content")}</Label>
        <Textarea
          className="min-h-40 flex-1 resize-none"
          id="memory-entry-content"
          readOnly={!canEdit}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="memory-entry-tags">{t("library.tags")}</Label>
        <Input
          id="memory-entry-tags"
          placeholder={t("library.tagsPlaceholder")}
          readOnly={!canEdit}
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>
      <Text size="meta" tone="muted">
        {[
          entry.updatedAt
            ? t("library.updatedAt", { time: formatTime(entry.updatedAt) })
            : null,
          entry.device,
          entry.id,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {canEdit ? (
        <div className="flex flex-col items-end gap-1">
          <Button
            disabled={!changes || invalid || saving}
            size="sm"
            type="submit"
          >
            {t("library.save")}
          </Button>
          {error ? (
            <Text size="meta" tone="destructive">
              {error}
            </Text>
          ) : null}
        </div>
      ) : null}
      {history && history.length > 0 ? (
        <section
          aria-label={t("library.entryHistory")}
          className="flex flex-col gap-1"
        >
          <Text size="meta" tone="muted">
            {t("library.entryHistory")}
          </Text>
          <ul className="flex flex-col gap-1">
            {history.map((row, index) => (
              <li
                className="flex items-baseline justify-between gap-3"
                key={`${row.action}-${row.at ?? index}`}
              >
                <Text size="body">
                  {actionLabels[row.action] ?? row.action}
                </Text>
                <Text className="shrink-0" size="meta" tone="muted">
                  {[row.actor, formatTime(row.at)].filter(Boolean).join(" · ")}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {canForget ? (
        <div className="flex flex-col items-start gap-1">
          <Text size="meta" tone="muted">
            {t("library.manage")}
          </Text>
          <AppRemoveButton
            cancelLabel={t("library.cancel")}
            confirmDescription={t("library.forgetDescription")}
            confirmLabel={t("library.forget")}
            confirmTitle={t("library.forgetTitle")}
            label={t("library.forget")}
            onConfirm={onForget}
          />
        </div>
      ) : null}
    </form>
  );
}
