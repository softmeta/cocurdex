import type * as React from "react";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib";

/*
 * Empty state primitive.
 *
 * Use this for "no results", "no items configured", or "nothing to show here"
 * panels so the title / description / optional action / optional icon stay
 * visually consistent across the app. Callers that previously hand-rolled
 * `<div className="text-center ..."><div>title</div><div>description</div>`
 * should reach for this component instead.
 *
 *   <EmptyState
 *     icon={<FolderSearch />}
 *     title={t('search:empty.noFiles.title')}
 *     description={t('search:empty.noFiles.description')}
 *   />
 */
export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
      data-slot="empty-state"
    >
      {icon ? (
        <div className="mb-2 text-muted-foreground [&_svg]:size-6">{icon}</div>
      ) : null}
      <Text size="sm" weight="medium" tone="primary">
        {title}
      </Text>
      {description ? (
        <Text size="xs" tone="muted">
          {description}
        </Text>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
