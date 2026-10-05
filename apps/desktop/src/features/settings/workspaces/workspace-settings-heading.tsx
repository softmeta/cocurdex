import { useAtom, useAtomValue } from "jotai";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { workspacesAtom } from "@/features/workspaces";
import { selectedSettingsWorkspaceIdAtom } from "./workspace-settings-store";

export function WorkspaceSettingsHeading() {
  const { t } = useTranslation("settings");
  const workspaces = useAtomValue(workspacesAtom);
  const [selectedId, setSelectedId] = useAtom(selectedSettingsWorkspaceIdAtom);
  const selected = workspaces.find((workspace) => workspace.id === selectedId);
  const sectionLabel = t("sections.workspaces");

  if (!selected) {
    return (
      <h1 className="truncate text-body font-semibold text-foreground">
        {sectionLabel}
      </h1>
    );
  }

  return (
    <h1 className="flex min-w-0 items-center gap-1 text-body font-semibold">
      <button
        className="app-no-drag shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        type="button"
        onClick={() => setSelectedId(null)}
      >
        {sectionLabel}
      </button>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
      <span className="min-w-0 truncate text-foreground">{selected.name}</span>
    </h1>
  );
}
