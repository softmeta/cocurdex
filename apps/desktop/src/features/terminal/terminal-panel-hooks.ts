import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  attachTerminal,
  detachTerminal,
  focusTerminal,
  getTerminalStatus,
  onTerminalOpenSearch,
  subscribeStatus,
  type TerminalStatus,
} from "./terminal-registry";

const SPAWNING_STATUS: TerminalStatus = { kind: "spawning" };

export function useActiveTerminalStatus(
  terminalId: string | null,
): TerminalStatus {
  return useSyncExternalStore(
    useCallback(
      (notify) => {
        if (!terminalId) {
          return () => {};
        }
        return subscribeStatus(terminalId, notify);
      },
      [terminalId],
    ),
    () => (terminalId ? getTerminalStatus(terminalId) : SPAWNING_STATUS),
  );
}

export function useTerminalSlot({
  terminalId,
  workspaceId,
  cwd,
  onOpenSearch,
}: {
  terminalId: string | null;
  workspaceId: string;
  cwd: string;
  onOpenSearch: () => void;
}) {
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !terminalId) {
      return;
    }
    attachTerminal(terminalId, workspaceId, cwd, slot);
    const unsubscribeSearch = onTerminalOpenSearch(terminalId, onOpenSearch);
    return () => {
      unsubscribeSearch();
      detachTerminal(terminalId);
    };
  }, [terminalId, workspaceId, cwd, onOpenSearch]);

  return slotRef;
}

export function useFocusTerminalWhenActive({
  terminalId,
  isActive,
  status,
}: {
  terminalId: string | null;
  isActive: boolean;
  status: TerminalStatus;
}) {
  useEffect(() => {
    if (isActive && status.kind === "ready" && terminalId) {
      focusTerminal(terminalId);
    }
  }, [terminalId, isActive, status.kind]);
}
