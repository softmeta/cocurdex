import type { IssueStatusCategory } from "@cocurdex/shared";
import { useId } from "react";
import { cn } from "@/lib";
import { statusFieldColor } from "./group-field-color";

const CATEGORY_COLORS: Partial<Record<IssueStatusCategory, string>> = {
  started: "var(--chat-status-running-text)",
  completed: "var(--chat-status-completed-text)",
};

function StatusGlyph({
  category,
  maskId,
}: {
  category: IssueStatusCategory | null;
  maskId: string;
}) {
  switch (category) {
    case "backlog":
      return (
        <circle
          cx="7"
          cy="7"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="1.57 1.57"
        />
      );
    case "started":
      return (
        <>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
        </>
      );
    case "completed":
    case "canceled":
      return (
        <>
          <mask id={maskId}>
            <rect width="14" height="14" fill="white" />
            <path
              d={
                category === "completed"
                  ? "M4.4 7.2 6.2 9 9.7 5.2"
                  : "M5 5 9 9M9 5 5 9"
              }
              fill="none"
              stroke="black"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
          <circle
            cx="7"
            cy="7"
            r="7"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </>
      );
    default:
      return (
        <circle
          cx="7"
          cy="7"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      );
  }
}

export function IssueStatusIcon({
  statusId,
  category,
  color,
  className,
}: {
  statusId: string;
  category: IssueStatusCategory | null;
  color?: string | null;
  className?: string;
}) {
  const maskId = useId();
  const tint =
    statusFieldColor(statusId, color) ??
    (category ? CATEGORY_COLORS[category] : undefined);
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      data-status-category={category ?? undefined}
      className={cn(
        "size-3.5 shrink-0",
        !tint && "text-muted-foreground",
        className,
      )}
      style={tint ? { color: tint } : undefined}
    >
      <StatusGlyph category={category} maskId={maskId} />
    </svg>
  );
}
