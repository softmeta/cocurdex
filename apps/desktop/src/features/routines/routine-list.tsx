import type { RoutineRecord } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SidebarListRow, Text } from "@/components/ui";
import { useScrollIntoViewWhenActive } from "@/lib/react-hooks";
import { describeSchedule } from "./routine-draft";

function RoutineRow({
  routine,
  agentName,
  active,
  onSelect,
}: {
  routine: RoutineRecord;
  agentName: string | null;
  active: boolean;
  onSelect(): void;
}) {
  const { t, i18n } = useTranslation("personal");
  const scrollRef = useScrollIntoViewWhenActive<HTMLLIElement>(active);
  const schedule = describeSchedule(t, routine.schedule, i18n.language);
  const pausedLabel =
    routine.pausedReason === "failures"
      ? t("routines.status.failures")
      : t("routines.status.paused");
  const subtitle = [routine.pausedReason ? pausedLabel : schedule, agentName]
    .filter(Boolean)
    .join(" · ");

  return (
    <li ref={scrollRef}>
      <SidebarListRow
        className="h-auto gap-2 py-1 ps-2"
        data-routine-id={routine.id}
        isActive={active}
        onClick={onSelect}
        render={
          <button aria-current={active ? "true" : undefined} type="button" />
        }
      >
        <span className="flex size-3 shrink-0 items-center justify-center self-start pt-2">
          {routine.pausedReason === "failures" ? (
            <span
              aria-label={pausedLabel}
              className="size-1.5 rounded-full bg-chat-status-failed-fg"
              role="img"
            />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-start">
          <Text truncate>{routine.name}</Text>
          <Text size="meta" tone="muted" truncate>
            {subtitle}
          </Text>
        </span>
      </SidebarListRow>
    </li>
  );
}

export function RoutineList({
  routines,
  agentNames,
  selectedId,
  onSelect,
}: {
  routines: RoutineRecord[];
  agentNames: ReadonlyMap<string, string>;
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {routines.map((routine) => (
        <RoutineRow
          active={routine.id === selectedId}
          agentName={agentNames.get(routine.agentId) ?? null}
          key={routine.id}
          routine={routine}
          onSelect={() => onSelect(routine.id)}
        />
      ))}
    </ul>
  );
}
