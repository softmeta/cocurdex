import type { WorkspaceRecord } from "@cocurdex/shared";
import { Folder, FolderOpen } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type AppDropdownTriggerAppearance,
  AppSearchableSelect,
} from "@/components";
import { Button } from "@/components/ui";
import { cn } from "@/lib";

// Collapse the macOS home prefix so long absolute paths read compactly in the
// trigger and list. Kept local to the picker since it is purely a display
// concern for workspace paths.
function compactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

const OPEN_FOLDER_VALUE = "__open_folder__";

interface WorkspacePickerProps {
  workspaces: WorkspaceRecord[];
  activeWorkspaceId?: string | null;
  workspaceName?: string | null;
  appearance?: AppDropdownTriggerAppearance;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  trigger?: ReactElement;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerLabel?: ReactNode;
  onSelectWorkspace?(workspaceId: string): void;
  onOpenWorkspace?(): void;
}

export function WorkspacePicker({
  workspaces,
  activeWorkspaceId,
  workspaceName,
  appearance = "ghost",
  align,
  side = "top",
  trigger,
  triggerAriaLabel,
  triggerClassName,
  triggerLabel,
  onSelectWorkspace,
  onOpenWorkspace,
}: WorkspacePickerProps) {
  const { t } = useTranslation("sessions");

  // This trigger sits on the composer header, whose background is --muted —
  // the same color the ghost variant hovers to, leaving no hover feedback at
  // all. Tint against the foreground instead so it reads as clickable on any
  // surface this picker is mounted on.
  const triggerClass = cn(
    "h-7 max-w-60 gap-1.5 px-2 hover:bg-foreground/8 aria-expanded:bg-foreground/8",
    triggerClassName,
  );

  const options = useMemo(
    () => [
      ...workspaces.map((workspace) => ({
        value: workspace.id,
        label: compactWorkspacePath(workspace.rootPath),
        keywords: `${workspace.name} ${workspace.rootPath}`,
        group: "recents",
        groupLabel: t("workspace.recents"),
        icon: <Folder className="size-3.5" />,
      })),
      {
        value: OPEN_FOLDER_VALUE,
        label: t("workspace.openFolder"),
        group: "actions",
        groupLabel: "",
        icon: <FolderOpen className="size-3.5" />,
      },
    ],
    [t, workspaces],
  );

  // First-run with zero workspaces: skip the empty menu and open the folder
  // picker on the outer trigger directly.
  if (workspaces.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant={appearance === "ghost" ? "ghost" : "outline"}
        className={triggerClass}
        onClick={() => onOpenWorkspace?.()}
      >
        <FolderOpen className="size-3.5" />
        {t("workspace.openFolder")}
      </Button>
    );
  }

  return (
    <AppSearchableSelect
      align={align}
      appearance={appearance}
      emptyText={t("workspace.empty")}
      options={options}
      searchPlaceholder={t("workspace.workspace")}
      side={side}
      trigger={trigger}
      triggerAriaLabel={triggerAriaLabel ?? t("workspace.workspace")}
      triggerClassName={triggerClass}
      triggerLabel={
        triggerLabel ?? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Folder className="size-3.5 shrink-0" />
            <span className="truncate">
              {workspaceName ?? t("workspace.enterProject")}
            </span>
          </span>
        )
      }
      value={activeWorkspaceId ?? ""}
      onValueChange={(next) => {
        if (next === OPEN_FOLDER_VALUE) {
          onOpenWorkspace?.();
          return;
        }
        onSelectWorkspace?.(next);
      }}
    />
  );
}
