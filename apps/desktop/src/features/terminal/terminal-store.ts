import { atom } from "jotai";

export interface TerminalTab {
  id: string;
}

export interface WorkspaceTerminalState {
  tabs: TerminalTab[];
  activeTabId: string;
}

export function createTerminalTab(): TerminalTab {
  return {
    id: `terminal:${crypto.randomUUID()}`,
  };
}

export const NO_WORKSPACE_TERMINAL_SCOPE_ID = "no-workspace";

export function primaryTerminalTabId(workspaceId: string): string {
  return `terminal:${workspaceId}:primary`;
}

export const workspaceTerminalStatesAtom = atom<
  Record<string, WorkspaceTerminalState>
>({});

const queuedCommands = new Map<string, string>();
const liveTerminalIds = new Set<string>();

export function markTerminalLive(terminalId: string, live: boolean) {
  if (live) {
    liveTerminalIds.add(terminalId);
  } else {
    liveTerminalIds.delete(terminalId);
  }
}

export function takeQueuedTerminalCommand(terminalId: string) {
  const command = queuedCommands.get(terminalId);
  queuedCommands.delete(terminalId);
  return command;
}

export const openTerminalTabAtom = atom(
  null,
  (get, set, input: { scopeId: string; command?: string }) => {
    const current = get(workspaceTerminalStatesAtom);
    const stored = current[input.scopeId]?.tabs ?? [];
    const primaryId = primaryTerminalTabId(input.scopeId);
    let tabs = stored;
    if (stored.length === 0 && liveTerminalIds.has(primaryId)) {
      tabs = [{ id: primaryId }];
    }
    const nextTab = createTerminalTab();
    if (input.command) {
      queuedCommands.set(
        nextTab.id,
        `${input.command.replace(/\r?\n/g, "\r")}\r`,
      );
    }
    set(workspaceTerminalStatesAtom, {
      ...current,
      [input.scopeId]: { tabs: [...tabs, nextTab], activeTabId: nextTab.id },
    });
  },
);
