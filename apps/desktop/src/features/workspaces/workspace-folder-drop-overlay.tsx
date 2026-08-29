import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

interface WorkspaceFolderDropOverlayProps {
  active: boolean;
}

/** Full-window affordance while an OS folder (or file) is dragged over the app. */
export function WorkspaceFolderDropOverlay({
  active,
}: WorkspaceFolderDropOverlayProps) {
  const { t } = useTranslation("sessions");

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/70 p-6 transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-card px-8 py-10 text-center shadow-lg">
        <FolderOpen className="size-8 text-muted-foreground" />
        <Text size="sm" weight="medium" tone="primary">
          {t("workspace.dropFolderTitle")}
        </Text>
        <Text size="xs" tone="muted">
          {t("workspace.dropFolderDescription")}
        </Text>
      </div>
    </div>
  );
}
