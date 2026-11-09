import type { RoutineRecord } from "@cocurdex/shared";
import { MessageSquare, Pause, Play } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRemoveButton, AppSelect } from "@/components";
import {
  Button,
  Input,
  Label,
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import {
  draftComplete,
  draftSchedule,
  emptyRoutineDraft,
  type RoutineDraft,
  routineDraft,
  WEEKDAYS,
  weekdayLabel,
} from "./routine-draft";
import { RoutineRuns } from "./routine-runs";
import { routinesApi } from "./routines-api";
import { revalidateRoutines, useRoutineRuns } from "./routines-queries";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function RoutineActions({
  routine,
  onOpenSession,
}: {
  routine: RoutineRecord;
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const paused = routine.pausedReason !== null;

  const act = async (work: () => Promise<unknown>, failure: string) => {
    try {
      await work();
      await revalidateRoutines();
    } catch (error) {
      toast.error(failure, { description: errorText(error) });
    }
  };

  return (
    <div className="-ms-2.5 flex flex-wrap items-center gap-1">
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() =>
          void act(() => routinesApi.run(routine.id), t("routines.runFailed"))
        }
      >
        <Play className="size-3.5" />
        {t("routines.runNow")}
      </Button>
      <Button
        size="sm"
        type="button"
        variant="ghost"
        onClick={() =>
          void act(
            () => routinesApi.update({ id: routine.id, paused: !paused }),
            t("routines.saveFailed"),
          )
        }
      >
        {paused ? (
          <Play className="size-3.5" />
        ) : (
          <Pause className="size-3.5" />
        )}
        {paused ? t("routines.resume") : t("routines.pause")}
      </Button>
      {routine.sessionId ? (
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            if (routine.sessionId) onOpenSession(routine.sessionId);
          }}
        >
          <MessageSquare className="size-3.5" />
          {t("routines.openThread")}
        </Button>
      ) : null}
    </div>
  );
}

export function RoutineForm({
  routine,
  defaultAgentId,
  agentOptions,
  onSaved,
  onDeleted,
  onOpenSession,
}: {
  routine: RoutineRecord | null;
  defaultAgentId: string;
  agentOptions: { value: string; label: string }[];
  onSaved(routine: RoutineRecord): void;
  onDeleted(): void;
  onOpenSession(sessionId: string): void;
}) {
  const { t, i18n } = useTranslation("personal");
  const [draft, setDraft] = useState<RoutineDraft>(() =>
    routine ? routineDraft(routine) : emptyRoutineDraft(defaultAgentId),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runs = useRoutineRuns(routine?.id ?? null);
  const change = (patch: Partial<RoutineDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const complete = draftComplete(draft);
  const paused = routine?.pausedReason;

  const accessOptions = [
    {
      value: "read-and-draft",
      label: t("routines.access.readAndDraft"),
      description: t("routines.access.readAndDraftDescription"),
    },
    {
      value: "full",
      label: t("routines.access.full"),
      description: t("routines.access.fullDescription"),
    },
  ];
  const deliverOptions = [
    {
      value: "inbox",
      label: t("routines.deliver.onFailure"),
      description: t("routines.deliver.onFailureDescription"),
    },
    {
      value: "push",
      label: t("routines.deliver.push"),
      description: t("routines.deliver.pushDescription"),
    },
    {
      value: "silent",
      label: t("routines.deliver.silent"),
      description: t("routines.deliver.silentDescription"),
    },
  ];

  const save = async () => {
    if (!complete) return;
    setSaving(true);
    setError(null);
    const fields = {
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      schedule: draftSchedule(draft),
      timeZone: draft.timeZone.trim(),
      access: draft.access,
      deliver: draft.deliver,
    };
    try {
      const saved = routine
        ? await routinesApi.update({ id: routine.id, ...fields })
        : await routinesApi.create({ agentId: draft.agentId, ...fields });
      await revalidateRoutines();
      onSaved(saved);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!routine) return;
    try {
      await routinesApi.remove(routine.id);
      await revalidateRoutines();
      onDeleted();
    } catch (cause) {
      toast.error(t("routines.deleteFailed"), {
        description: errorText(cause),
      });
    }
  };

  return (
    <form
      aria-label={routine ? routine.name : t("routines.new")}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      data-routine-id={routine?.id}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {routine ? (
        <RoutineActions onOpenSession={onOpenSession} routine={routine} />
      ) : null}
      {paused === "failures" ? (
        <Text size="meta" tone="destructive">
          {t("routines.pausedAfterFailures")}
        </Text>
      ) : null}
      {routine ? null : (
        <Field id="routine-agent" label={t("routines.agent")}>
          <AppSelect
            options={agentOptions}
            triggerAriaLabel={t("routines.agent")}
            value={draft.agentId}
            onValueChange={(agentId) => change({ agentId })}
          />
        </Field>
      )}
      <Field id="routine-name" label={t("routines.name")}>
        <Input
          id="routine-name"
          value={draft.name}
          onChange={(event) => change({ name: event.target.value })}
        />
      </Field>
      <Field id="routine-prompt" label={t("routines.prompt")}>
        <Textarea
          className="min-h-28 resize-y"
          id="routine-prompt"
          placeholder={t("routines.promptPlaceholder")}
          value={draft.prompt}
          onChange={(event) => change({ prompt: event.target.value })}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Text as="span" size="body" weight="medium">
          {t("routines.schedule.label")}
        </Text>
        <ToggleGroup
          aria-label={t("routines.schedule.label")}
          spacing={0.5}
          type="single"
          value={draft.kind}
          variant="segmented"
          onValueChange={(value) => {
            if (value === "interval" || value === "daily") {
              change({ kind: value });
            }
          }}
        >
          <ToggleGroupItem value="daily">
            {t("routines.schedule.kindDaily")}
          </ToggleGroupItem>
          <ToggleGroupItem value="interval">
            {t("routines.schedule.kindInterval")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {draft.kind === "interval" ? (
        <Field id="routine-minutes" label={t("routines.schedule.minutes")}>
          <Input
            className="w-24 tabular-nums"
            id="routine-minutes"
            inputMode="numeric"
            min={5}
            type="number"
            value={draft.minutes}
            onChange={(event) => change({ minutes: event.target.value })}
          />
        </Field>
      ) : (
        <>
          <Field id="routine-time" label={t("routines.schedule.time")}>
            <Input
              className="w-32 tabular-nums"
              id="routine-time"
              type="time"
              value={draft.time}
              onChange={(event) => change({ time: event.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Text as="span" size="body" weight="medium">
              {t("routines.schedule.repeatOn")}
            </Text>
            <ToggleGroup
              aria-label={t("routines.schedule.repeatOn")}
              className="flex-wrap"
              spacing={0.5}
              type="multiple"
              value={draft.weekdays.map(String)}
              variant="segmented"
              onValueChange={(values) =>
                change({ weekdays: values.map(Number) })
              }
            >
              {WEEKDAYS.map((day) => (
                <ToggleGroupItem key={day} value={String(day)}>
                  {weekdayLabel(day, i18n.language)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </>
      )}
      <Field id="routine-time-zone" label={t("routines.timeZone")}>
        <Input
          id="routine-time-zone"
          value={draft.timeZone}
          onChange={(event) => change({ timeZone: event.target.value })}
        />
      </Field>
      <Field id="routine-access" label={t("routines.access.label")}>
        <AppSelect
          options={accessOptions}
          triggerAriaLabel={t("routines.access.label")}
          value={draft.access}
          onValueChange={(value) =>
            change({ access: value as RoutineDraft["access"] })
          }
        />
      </Field>
      <Field id="routine-deliver" label={t("routines.deliver.label")}>
        <AppSelect
          options={deliverOptions}
          triggerAriaLabel={t("routines.deliver.label")}
          value={draft.deliver}
          onValueChange={(value) =>
            change({ deliver: value as RoutineDraft["deliver"] })
          }
        />
      </Field>
      <div className="flex flex-col items-end gap-1">
        <Button disabled={!complete || saving} size="sm" type="submit">
          {routine ? t("routines.save") : t("routines.create")}
        </Button>
        {error ? (
          <Text size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
      </div>
      {routine ? <RoutineRuns runs={runs} /> : null}
      {routine ? (
        <div className="flex flex-col items-start gap-1">
          <Text size="meta" tone="muted">
            {t("routines.manage")}
          </Text>
          <AppRemoveButton
            cancelLabel={t("routines.cancel")}
            confirmDescription={t("routines.deleteDescription")}
            confirmLabel={t("routines.delete")}
            confirmTitle={t("routines.deleteTitle", { name: routine.name })}
            label={t("routines.delete")}
            onConfirm={() => void remove()}
          />
        </div>
      ) : null}
    </form>
  );
}
