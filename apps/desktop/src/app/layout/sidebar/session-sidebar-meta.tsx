import { Fragment } from "react";
import { Text } from "@/components/ui";
import { AgentIcon, AgentRoleAvatar } from "@/features/sessions";
import type { SessionMetaItem } from "./session-sidebar-meta-items";

function SessionMetaIcon({ item }: { item: SessionMetaItem }) {
  if (item.role) {
    return (
      <AgentRoleAvatar
        className="size-4 text-2xs"
        role={item.role}
        showAgent={Boolean(item.showRoleAgent)}
      />
    );
  }
  if (!item.agentId) {
    return null;
  }
  return (
    <AgentIcon agentId={item.agentId} className="size-3.5 text-sidebar-fg" />
  );
}

export function SessionSidebarMeta({
  items,
}: {
  items: readonly SessionMetaItem[];
}) {
  const isIconOnly = (item: SessionMetaItem | undefined) =>
    Boolean(item?.agentId) && items.length > 1;

  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden text-sidebar-fg-subtle">
      {items.map((item, index) => {
        const showSeparator = index > 0 && !isIconOnly(items[index - 1]);

        if (isIconOnly(item)) {
          return (
            <span
              key={item.key}
              className="flex shrink-0 items-center pe-0.5"
              role="img"
              aria-label={item.label}
            >
              <SessionMetaIcon item={item} />
            </span>
          );
        }
        return (
          <Fragment key={item.key}>
            {showSeparator ? (
              <Text size="meta" className="shrink-0" aria-hidden>
                ·
              </Text>
            ) : null}
            <span className="flex min-w-0 shrink items-center gap-1">
              <SessionMetaIcon item={item} />
              <Text size="meta" className="min-w-0 truncate">
                {item.label}
              </Text>
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}
