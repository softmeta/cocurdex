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

export interface PtyActivityEvent {
  terminalId: string;
  workspaceId: string;
  foregroundProcess: string | null;
  cwd: string | null;
}

export interface PtySpawnResult {
  terminalId: string;
  workspaceId: string;
  pid: number;
  shell: string;
  cwd: string;
}

export type TerminalDaemonEvent =
  | ({ type: "terminal.data" } & PtyDataEvent)
  | ({ type: "terminal.exit" } & PtyExitEvent)
  | ({ type: "terminal.activity" } & PtyActivityEvent);
