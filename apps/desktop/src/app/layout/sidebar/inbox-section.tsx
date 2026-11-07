import type { InboxItem } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { SidebarListRow, Text } from "@/components/ui";
import { inboxDotClass, inboxKindLabel } from "@/features/inbox";
import { useCompactAgeLabel } from "@/lib/relative-time";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarSectionHeading } from "./sidebar-section-heading";
import { useSidebarSectionCollapse } from "./use-sidebar-section-collapse";

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
  const label = inboxKindLabel(t, item.kind);
  const subtitle = item.detail ? `${label} · ${item.detail}` : label;

  return (
    <SidebarListRow
      className="h-auto gap-2 py-1 ps-2"
      data-inbox-item-id={item.id}
      isActive={isActive}
      onClick={() => onOpen(item)}
      render={<button type="button" />}
    >
      <span className="flex size-4 shrink-0 items-center justify-center self-start pt-1.5">
        <span
          aria-label={label}
          className={`size-1.5 rounded-full ${inboxDotClass(item.kind)}`}
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
    <section aria-label={t("inbox.heading")} className="pe-1 pb-3">
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
