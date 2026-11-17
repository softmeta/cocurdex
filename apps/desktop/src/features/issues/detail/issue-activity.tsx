import type {
  IssueActor,
  IssueEvent,
  IssueFieldChange,
} from "@cocurdex/shared";
import { ArrowUp, Bot, SquareTerminal, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconButton,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { useActivityTimeLabel } from "@/lib/relative-time";

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

function EventTime({ timestamp }: { timestamp: string }) {
  const time = useActivityTimeLabel(timestamp);
  if (!time) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Text
          size="meta"
          tone="muted"
          className="ms-auto shrink-0 tabular-nums"
        >
          {time.relative}
        </Text>
      </TooltipTrigger>
      <TooltipContent>{time.absolute}</TooltipContent>
    </Tooltip>
  );
}

function ActorIcon({ actor }: { actor: IssueActor }) {
  const Icon = {
    cli: SquareTerminal,
    session: Bot,
    user: UserRound,
  }[actor.kind];
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-settings-surface text-editor-fg-muted">
      <Icon className="size-3" aria-hidden />
    </span>
  );
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
    <section className="flex flex-col gap-3 px-5 pt-10">
      <Text size="body" weight="medium" className="text-editor-fg">
        {t("activity.title")}
      </Text>
      <ol className="flex flex-col gap-3">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-1">
            <div className="flex h-5 min-w-0 items-center gap-2">
              <ActorIcon actor={event.actor} />
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
              <EventTime timestamp={event.createdAt} />
            </div>
            {event.body ? (
              <Text
                size="body"
                className="ms-7 whitespace-pre-wrap rounded-card bg-settings-surface px-3 py-2 text-editor-fg"
              >
                {event.body}
              </Text>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-col rounded-card bg-settings-surface">
        <textarea
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
          className="field-sizing-content max-h-60 min-h-16 resize-none bg-transparent px-3 pt-3 text-body text-editor-fg outline-none placeholder:text-editor-fg-subtle"
        />
        <div className="flex justify-end px-2 pb-2">
          <IconButton
            size="sm"
            aria-label={t("activity.comment")}
            disabled={!draft.trim() || sending}
            onClick={() => {
              void submit();
            }}
          >
            <ArrowUp className="size-4" />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
