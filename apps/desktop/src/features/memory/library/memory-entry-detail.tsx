import type {
  MemoryEntry,
  MemoryHistoryEntry,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton } from "@/components";
import { Button, Label, Text } from "@/components/ui";
import { cn } from "@/lib";

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
  loaded,
  canForget,
  onSave,
  onForget,
}: {
  entry: MemoryEntry;
  history: MemoryHistoryEntry[] | null;
  canEdit: boolean;
  loaded: boolean;
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

  const properties = [
    {
      key: "updated",
      label: t("library.updated"),
      value: formatTime(entry.updatedAt),
      mono: false,
    },
    {
      key: "device",
      label: t("library.device"),
      value: entry.device,
      mono: false,
    },
    { key: "id", label: t("library.id"), value: entry.id, mono: true },
  ].filter((property) => property.value);

  return (
    <form
      aria-label={t("library.detail")}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-memory-id={entry.id}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-10 pb-8">
        <div className="flex flex-col gap-3">
          <div className="flex h-8 items-center gap-3">
            <input
              aria-label={t("library.title")}
              className="min-w-0 flex-1 bg-transparent font-semibold text-foreground text-title placeholder:text-muted-foreground focus:outline-none"
              id="memory-entry-title"
              readOnly={!canEdit || !loaded}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            {canEdit ? (
              <Button
                disabled={!loaded || !changes || invalid || saving}
                size="sm"
                type="submit"
              >
                {t("library.save")}
              </Button>
            ) : null}
          </div>
          {error ? (
            <Text size="meta" tone="destructive">
              {error}
            </Text>
          ) : null}
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
            <dt>
              <Label
                className="font-normal text-meta text-muted-foreground"
                htmlFor="memory-entry-tags"
              >
                {t("library.tags")}
              </Label>
            </dt>
            <dd>
              <input
                className="h-6 w-full bg-transparent text-foreground text-meta placeholder:text-muted-foreground focus:outline-none"
                id="memory-entry-tags"
                placeholder={t("library.tagsPlaceholder")}
                readOnly={!canEdit || !loaded}
                type="text"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </dd>
            {properties.map((property) => (
              <Fragment key={property.key}>
                <dt>
                  <Text size="meta" tone="muted">
                    {property.label}
                  </Text>
                </dt>
                <dd className="flex h-6 min-w-0 items-center">
                  <Text
                    className={cn("truncate", property.mono && "font-mono")}
                    size="meta"
                  >
                    {property.value}
                  </Text>
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
        <textarea
          aria-label={t("library.content")}
          className="field-sizing-content min-h-40 w-full resize-none bg-transparent text-body text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none"
          id="memory-entry-content"
          readOnly={!canEdit || !loaded}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        {history && history.length > 0 ? (
          <section
            aria-label={t("library.entryHistory")}
            className="flex flex-col gap-2"
          >
            <Text size="meta" tone="muted">
              {t("library.entryHistory")}
            </Text>
            <ul className="flex flex-col gap-1.5">
              {history.map((row, index) => (
                <li
                  className="flex items-baseline justify-between gap-3"
                  key={`${row.action}-${row.at ?? index}`}
                >
                  <Text size="meta">
                    {actionLabels[row.action] ?? row.action}
                  </Text>
                  <Text className="truncate" size="meta" tone="muted">
                    {[row.actor, formatTime(row.at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {canForget ? (
          <div className="flex flex-col items-start gap-2">
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
      </div>
    </form>
  );
}
