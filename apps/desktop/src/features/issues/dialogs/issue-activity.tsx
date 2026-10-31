import type {
  IssueActor,
  IssueEvent,
  IssueFieldChange,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Textarea } from "@/components/ui";
import { i18n } from "@/i18n";

interface FieldOptions {
  statusOptions: ReadonlyArray<{ id: string; title: string }>;
  priorityOptions: ReadonlyArray<{ id: string; title: string }>;
}

function useActorLabel() {
  const { t } = useTranslation("issues");
  return (actor: IssueActor) => {
    if (actor.kind === "cli") {
      return t("activity.actor.cli");
    }
    if (actor.kind === "session") {
      return t("activity.actor.session");
    }
    return t("activity.actor.user");
  };
}

function optionTitle(
  options: FieldOptions["statusOptions"],
  value: string | null,
): string | null {
  return options.find((option) => option.id === value)?.title ?? value;
}

function useChangeText(fieldOptions: FieldOptions) {
  const { t } = useTranslation("issues");
  const fieldLabels: Record<IssueFieldChange["field"], string> = {
    title: t("activity.field.title"),
    description: t("activity.field.description"),
    status: t("activity.field.status"),
    priority: t("activity.field.priority"),
    workspace: t("activity.field.workspace"),
    parent: t("activity.field.parent"),
    labels: t("activity.field.labels"),
  };
  return (change: IssueFieldChange) => {
    const field = fieldLabels[change.field] ?? change.field;
    if (change.field === "description") {
      return t("activity.changedField", { field });
    }
    const resolve = (value: string | null) => {
      if (change.field === "status") {
        return optionTitle(fieldOptions.statusOptions, value);
      }
      if (change.field === "priority") {
        return optionTitle(fieldOptions.priorityOptions, value);
      }
      return value;
    };
    return t("activity.changedFieldTo", {
      field,
      value: resolve(change.to) ?? t("activity.none"),
    });
  };
}

function useEventText(fieldOptions: FieldOptions) {
  const { t } = useTranslation("issues");
  const changeText = useChangeText(fieldOptions);
  return (event: IssueEvent) => {
    const related = event.relatedIssue?.identifier ?? "";
    switch (event.kind) {
      case "created":
        return t("activity.created");
      case "updated":
        return event.changes.map(changeText).join(" · ");
      case "relation_added":
        return t("activity.relationAdded", { issue: related });
      case "relation_removed":
        return t("activity.relationRemoved", { issue: related });
      case "session_linked":
        return t("activity.sessionLinked");
      default:
        return "";
    }
  };
}

export function IssueActivity({
  events,
  statusOptions,
  priorityOptions,
  onComment,
}: FieldOptions & {
  events: readonly IssueEvent[];
  onComment: (body: string) => Promise<boolean>;
}) {
  const { t } = useTranslation("issues");
  const actorLabel = useActorLabel();
  const eventText = useEventText({ statusOptions, priorityOptions });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) {
      return;
    }
    setSending(true);
    const sent = await onComment(body);
    setSending(false);
    if (sent) {
      setDraft("");
    }
  };

  return (
    <section className="flex flex-col gap-2 border-t border-editor-border/60 px-5 py-2.5">
      <Text size="meta" weight="medium" className="text-editor-fg-muted">
        {t("activity.title")}
      </Text>
      <ol className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <Text
                size="meta"
                weight="medium"
                className="shrink-0 text-editor-fg"
              >
                {actorLabel(event.actor)}
              </Text>
              <Text size="meta" truncate className="text-editor-fg-muted">
                {event.kind === "commented"
                  ? t("activity.commented")
                  : eventText(event)}
              </Text>
              <Text
                size="meta"
                className="ms-auto shrink-0 text-editor-fg-subtle"
              >
                {dateFormat.format(new Date(event.createdAt))}
              </Text>
            </div>
            {event.body ? (
              <Text size="body" className="whitespace-pre-wrap text-editor-fg">
                {event.body}
              </Text>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5">
        <Textarea
          value={draft}
          rows={2}
          placeholder={t("activity.commentPlaceholder")}
          aria-label={t("activity.commentPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.stopPropagation();
              void submit();
            }
          }}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={!draft.trim() || sending}
            onClick={() => {
              void submit();
            }}
          >
            {t("activity.comment")}
          </Button>
        </div>
      </div>
    </section>
  );
}
