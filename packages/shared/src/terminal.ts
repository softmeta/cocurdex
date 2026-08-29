// Wire types shared between the Electron main process (node-pty owner) and the
// renderer (xterm.js consumer). A PTY session is keyed by terminalId, while
// workspaceId keeps the renderer able to group broadcast events by workspace.

export interface PtySpawnPayload {
  terminalId: string;
  workspaceId: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface PtyWritePayload {
  terminalId: string;
  data: string;
}

export interface PtyResizePayload {
  terminalId: string;
  cols: number;
  rows: number;
}

export interface PtyKillPayload {
  terminalId: string;
}

export interface PtyDataEvent {
  terminalId: string;
  workspaceId: string;
  data: string;
}

export interface PtyExitEvent {
  terminalId: string;
  workspaceId: string;
  exitCode: number;
  signal?: number;
}

// Emitted by the main process when a terminal's foreground activity changes:
// the deepest descendant process under the shell (the command the user is
// currently running) and that process's working directory. Both are best
// effort and may be null when idle, unresolved, or unsupported on the platform.
export interface PtyActivityEvent {
  terminalId: string;
  workspaceId: string;
  // Friendly name of the foreground command (e.g. "node", "vim"), or null when
  // the shell sits at its prompt.
  foregroundProcess: string | null;
  // Absolute working directory of the foreground process (or the shell when
  // idle), or null when it can't be resolved.
  cwd: string | null;
}

export interface PtySpawnResult {
  terminalId: string;
  workspaceId: string;
  pid: number;
  shell: string;
  cwd: string;
}
