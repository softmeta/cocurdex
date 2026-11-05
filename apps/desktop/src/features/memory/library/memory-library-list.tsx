import type { MemoryEntry, MemoryHistoryEntry } from "@cocurdex/shared";
import { Brain, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, SidebarListRow, Text } from "@/components/ui";
import { useScrollIntoViewWhenActive } from "@/lib/react-hooks";
import { buildMemoryTree, groupMemoriesByDay } from "./memory-library-groups";

export type MemoryLibraryMode = "diary" | "tree" | "history";

function formatDay(day: string | null, locale: string, undated: string) {
  if (!day) return undated;
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(year, month - 1, date),
  );
}

function formatTime(value: string | null, locale: string) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(time));
}

function MemoryRow({
  entry,
  depth,
  active,
  onSelect,
}: {
  entry: MemoryEntry;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  const scrollRef = useScrollIntoViewWhenActive<HTMLDivElement>(active);
  return (
    <SidebarListRow
      ref={scrollRef}
      isActive={active}
      data-memory-id={entry.id}
      style={{ paddingInlineStart: `${0.5 + depth}rem` }}
    >
      <button
        aria-current={active ? "true" : undefined}
        className="flex h-6 min-w-0 flex-1 items-center truncate text-start"
        type="button"
        onClick={onSelect}
      >
        {entry.title}
      </button>
    </SidebarListRow>
  );
}

function DayHeading({ children }: { children: string }) {
  return (
    <Text
      className="sticky top-0 z-10 bg-editor-shell px-2 pt-2 pb-1"
      size="meta"
      tone="muted"
    >
      {children}
    </Text>
  );
}

export function MemoryLibraryList({
  mode,
  entries,
  history,
  selectedId,
  canRestore,
  onSelect,
  onRestore,
}: {
  mode: MemoryLibraryMode;
  entries: MemoryEntry[];
  history: MemoryHistoryEntry[];
  selectedId: string | null;
  canRestore: boolean;
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("memory");
  const actionLabels: Record<string, string> = {
    create: t("library.action.create"),
    update: t("library.action.update"),
    delete: t("library.action.delete"),
    restore: t("library.action.restore"),
    merge: t("library.action.merge"),
  };

  if (mode === "history") {
    if (history.length === 0) {
      return (
        <EmptyState
          icon={<Brain />}
          title={t("library.historyEmpty")}
          description={t("library.historyEmptyDescription")}
        />
      );
    }
    return (
      <ul aria-label={t("library.history")} className="flex flex-col gap-0.5">
        {history.map((row, index) => (
          <li
            className="flex min-h-8 items-center gap-2 px-2"
            data-memory-id={row.entryId}
            key={`${row.entryId}-${row.at ?? index}`}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <Text className="truncate" size="body">
                {row.title ?? row.entryId}
              </Text>
              <Text className="truncate" size="meta" tone="muted">
                {[
                  actionLabels[row.action] ?? row.action,
                  formatTime(row.at, i18n.language),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </div>
            {row.action === "delete" && canRestore ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRestore(row.entryId)}
              >
                <RotateCcw className="size-3.5" />
                {t("library.restore")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Brain />}
        title={t("library.empty")}
        description={t("library.emptyDescription")}
      />
    );
  }

  if (mode === "tree") {
    return (
      <ul aria-label={t("library.list")} className="flex flex-col">
        {buildMemoryTree(entries).map(({ entry, depth }) => (
          <li key={entry.id}>
            <MemoryRow
              active={entry.id === selectedId}
              depth={depth}
              entry={entry}
              onSelect={() => onSelect(entry.id)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul aria-label={t("library.list")} className="flex flex-col">
      {groupMemoriesByDay(entries).map((group) => (
        <li className="flex flex-col" key={group.day ?? "undated"}>
          <DayHeading>
            {formatDay(group.day, i18n.language, t("library.undated"))}
          </DayHeading>
          {group.entries.map((entry) => (
            <MemoryRow
              active={entry.id === selectedId}
              depth={0}
              entry={entry}
              key={entry.id}
              onSelect={() => onSelect(entry.id)}
            />
          ))}
        </li>
      ))}
    </ul>
  );
}
