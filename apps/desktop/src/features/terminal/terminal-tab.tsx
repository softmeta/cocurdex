import { TerminalSquare, X } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { cn, useScrollIntoViewWhenActive } from "@/lib";
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
  // 1-based position label, used as the fallback before the shell is known.
  index: number;
  selected: boolean;
  onSelect: (terminalId: string) => void;
  onClose: (terminalId: string) => void;
}

// Subscribe to a single terminal's lifecycle status. The registry parks the
// listener until the entry exists, so this works for inactive tabs that have
// never been attached as well as the active one.
function useTerminalStatus(terminalId: string): TerminalStatus {
  return useSyncExternalStore(
    useCallback((notify) => subscribeStatus(terminalId, notify), [terminalId]),
    () => getTerminalStatus(terminalId),
  );
}

// Foreground process / cwd pushed from the main-process poller.
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
  // Keep the active tab in view when it is selected or newly added while the
  // row is scrolled — the overflow container is the external system synced here.
  const ref = useScrollIntoViewWhenActive<HTMLDivElement>(selected);

  // Label priority: the running foreground command, else the current working
  // directory name, else the shell name once live, else the numbered fallback.
  // While spawning we render no text at all — the icon stays put and the label
  // appears once the shell resolves (a transient spinner flickered for the ~1
  // frame spawning lasts, and a CJK placeholder was wider than "zsh" so it
  // shrank on ready and nudged the adjacent "+" button).
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
    <div
      className={cn(
        "group flex h-7 w-36 shrink-0 items-center rounded-control text-meta transition-colors",
        selected
          ? "bg-editor-tab-active-bg text-editor-fg"
          : "text-editor-fg-subtle hover:bg-editor-tab-hover-bg hover:text-editor-fg",
      )}
      ref={ref}
    >
      <button
        aria-label={t("terminal.selectTab", { index: String(index) })}
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 ps-2 pe-1 text-start"
        onClick={() => onSelect(terminalId)}
        title={activity?.cwd ?? undefined}
        type="button"
      >
        <TerminalSquare className="size-3.5 shrink-0" />
        {status.kind === "spawning" ? null : (
          <span className="truncate">{label}</span>
        )}
      </button>
      <button
        aria-label={t("terminal.closeTab", { index: String(index) })}
        // Always reserve the slot's width and toggle only opacity, so
        // revealing the close button on hover never reflows the tab.
        className={cn(
          "me-1 flex size-4 shrink-0 items-center justify-center rounded-control text-editor-fg-muted transition-opacity hover:bg-editor-tab-hover-bg hover:text-editor-fg",
          selected
            ? "opacity-100"
            : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
        )}
        onClick={() => onClose(terminalId)}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
