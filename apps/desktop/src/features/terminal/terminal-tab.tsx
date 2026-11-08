import { TerminalSquare } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { AppPanelTab } from "@/components";
import {
  getTerminalActivity,
  getTerminalStatus,
  subscribeActivity,
  subscribeStatus,
  type TerminalActivity,
  type TerminalStatus,
} from "./terminal-registry";

interface TerminalTabItemProps {
  terminalId: string;
  index: number;
  selected: boolean;
  onSelect: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
}

function useTerminalStatus(terminalId: string): TerminalStatus {
  return useSyncExternalStore(
    useCallback((notify) => subscribeStatus(terminalId, notify), [terminalId]),
    () => getTerminalStatus(terminalId),
  );
}

function useTerminalActivity(terminalId: string): TerminalActivity | null {
  return useSyncExternalStore(
    useCallback(
      (notify) => subscribeActivity(terminalId, notify),
      [terminalId],
    ),
    () => getTerminalActivity(terminalId),
  );
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function TerminalTabItem({
  terminalId,
  index,
  selected,
  onSelect,
  onClose,
}: TerminalTabItemProps) {
  const { t } = useTranslation("editor");
  const status = useTerminalStatus(terminalId);
  const activity = useTerminalActivity(terminalId);

  function resolveLabel(): string {
    if (activity?.foregroundProcess) {
      return activity.foregroundProcess;
    }
    if (activity?.cwd) {
      return basename(activity.cwd);
    }
    if (status.kind === "ready") {
      return status.shell;
    }
    return t("terminal.tabLabel", { index: String(index) });
  }
  const label = resolveLabel();

  return (
    <AppPanelTab
      active={selected}
      width="fixed"
      label={status.kind === "spawning" ? "" : label}
      selectLabel={t("terminal.selectTab", { index: String(index) })}
      closeLabel={t("terminal.closeTab", { index: String(index) })}
      title={activity?.cwd ?? undefined}
      icon={<TerminalSquare className="size-3.5 shrink-0" />}
      onSelect={() => onSelect(terminalId)}
      onClose={() => onClose(terminalId)}
    />
  );
}
