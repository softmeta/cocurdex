import {
  INBOX_FAILURE_KINDS,
  INBOX_NEEDS_YOU_KINDS,
  type InboxItem,
  type InboxItemKind,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { SidebarListRow, Text } from "@/components/ui";
import { useCompactAgeLabel } from "@/lib/relative-time";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarSectionHeading } from "./sidebar-section-heading";
import { useSidebarSectionCollapse } from "./use-sidebar-section-collapse";

function kindLabel(t: TFunction<"personal">, kind: InboxItemKind) {
  switch (kind) {
    case "approval":
      return t("inbox.kind.approval");
    case "question":
      return t("inbox.kind.question");
    case "plan":
      return t("inbox.kind.plan");
    case "failed":
      return t("inbox.kind.failed");
    case "completed":
      return t("inbox.kind.completed");
    case "routine-failed":
      return t("inbox.kind.routineFailed");
    case "routine-paused":
      return t("inbox.kind.routinePaused");
    case "routine-result":
      return t("inbox.kind.routineResult");
  }
}

function dotClass(kind: InboxItemKind) {
  if (INBOX_NEEDS_YOU_KINDS.includes(kind)) {
    return "sidebar-activity-dot text-chat-status-pending-fg";
  }
  if (INBOX_FAILURE_KINDS.includes(kind)) return "bg-chat-status-failed-fg";
  return "bg-sidebar-primary";
}

function InboxRow({
  item,
  isActive,
  onOpen,
}: {
  item: InboxItem;
  isActive: boolean;
  onOpen(item: InboxItem): void;
}) {
  const { t } = useTranslation("personal");
  const age = useCompactAgeLabel(item.at);
  const label = kindLabel(t, item.kind);
  const subtitle = item.detail ? `${label} · ${item.detail}` : label;

  return (
    <SidebarListRow
      className="h-auto gap-2 py-1 ps-1"
      data-inbox-item-id={item.id}
      isActive={isActive}
      onClick={() => onOpen(item)}
      render={<button type="button" />}
    >
      <span className="flex size-4 shrink-0 items-center justify-center self-start pt-1.5">
        <span
          aria-label={label}
          className={`size-1.5 rounded-full ${dotClass(item.kind)}`}
          role="img"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <SidebarOverflowTitle>{item.title}</SidebarOverflowTitle>
          <Text
            className="ms-auto shrink-0 text-sidebar-fg-subtle tabular-nums"
            size="meta"
          >
            {age}
          </Text>
        </span>
        <Text
          className="truncate font-normal text-sidebar-fg-subtle"
          size="meta"
        >
          {subtitle}
        </Text>
      </span>
    </SidebarListRow>
  );
}

export function InboxSection({
  activeSessionId,
  items,
  onOpen,
}: {
  activeSessionId: string | null;
  items: readonly InboxItem[];
  onOpen(item: InboxItem): void;
}) {
  const { t } = useTranslation("personal");
  const { collapsed } = useSidebarSectionCollapse("inbox");
  if (items.length === 0) return null;

  return (
    <section aria-label={t("inbox.heading")} className="pe-3 pb-3">
      <SidebarSectionHeading section="inbox">
        {t("inbox.headingCount", { total: items.length })}
      </SidebarSectionHeading>
      {collapsed ? null : (
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <InboxRow
                isActive={
                  item.sessionId !== null && item.sessionId === activeSessionId
                }
                item={item}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
