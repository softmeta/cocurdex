import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn, useScrollIntoViewWhenActive } from "@/lib";

interface AppPanelTabProps {
  active: boolean;
  label: string;
  closeLabel: string;
  icon?: ReactNode;
  selectLabel?: string;
  title?: string;
  italic?: boolean;
  width?: "fit" | "fixed";
  onSelect(): void;
  onDoubleClick?(): void;
  onClose(): void;
}

export function AppPanelTab({
  active,
  label,
  closeLabel,
  icon,
  selectLabel,
  title,
  italic = false,
  width = "fit",
  onSelect,
  onDoubleClick,
  onClose,
}: AppPanelTabProps) {
  const ref = useScrollIntoViewWhenActive<HTMLDivElement>(active);

  return (
    <div
      ref={ref}
      className={cn(
        "app-no-drag group flex h-6 shrink-0 items-center rounded-control text-meta transition-colors",
        { fit: "max-w-44", fixed: "w-36" }[width],
        active && "bg-editor-tab-active-bg text-editor-fg",
        !active &&
          "text-editor-fg-muted hover:bg-editor-tab-hover-bg hover:text-editor-fg-subtle",
      )}
    >
      <button
        type="button"
        aria-label={selectLabel}
        title={title}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1.5 ps-2 pe-1 text-start",
          italic && "italic",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          "me-1 flex size-4 shrink-0 items-center justify-center rounded-control text-editor-fg-muted transition-opacity hover:bg-editor-tab-hover-bg hover:text-editor-fg",
          !active &&
            "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
