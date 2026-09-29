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

// Synthetic scope when no project workspace is selected. Terminals still need a
// stable key for tab state + PTY metadata; the shell cwd is the user home dir.
export const NO_WORKSPACE_TERMINAL_SCOPE_ID = "no-workspace";

// Deterministic id for the implicit first tab of a workspace. Because it is
// derived from the workspaceId rather than minted, TerminalPanel can render the
// primary tab without writing to the store first, yet still hand the registry a
// stable id across remounts. Added tabs use createTerminalTab's random ids.
export function primaryTerminalTabId(workspaceId: string): string {
  return `terminal:${workspaceId}:primary`;
}

// Terminal tab state lives outside TerminalPanel so the panel can unmount
// (right-panel collapse, window-narrow, view switch) and remount without
// minting new tab ids. Stable ids let terminal-registry reuse the cached xterm
// + PTY entry instead of spawning a fresh shell — and stop orphaning the old
// entry in the registry on every remount.
export const workspaceTerminalStatesAtom = atom<
  Record<string, WorkspaceTerminalState>
>({});

const queuedCommands = new Map<string, string>();

export function takeQueuedTerminalCommand(terminalId: string) {
  const command = queuedCommands.get(terminalId);
  queuedCommands.delete(terminalId);
  return command;
}

export const openTerminalTabAtom = atom(
  null,
  (get, set, input: { scopeId: string; command?: string }) => {
    const current = get(workspaceTerminalStatesAtom);
    const stored = current[input.scopeId]?.tabs;
    const tabs =
      stored && stored.length > 0
        ? stored
        : [{ id: primaryTerminalTabId(input.scopeId) }];
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
