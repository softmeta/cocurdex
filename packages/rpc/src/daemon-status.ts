import type { LogLevel } from "@cocurdex/shared";

export interface DaemonMetadata {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  token: string;
  startedAt: string;
  webSocketUrl: string;
  agentToolsUrl?: string;
}

export type DaemonConnectionInfo = Pick<
  DaemonMetadata,
  "webSocketUrl" | "token"
>;

export interface DaemonStatus {
  hostId: string;
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

export interface DaemonActiveWork {
  agentTurns: number;
  queuedInputs: number;
  workflowActive: boolean;
  workspaceSearches: number;
}

export interface DaemonHealth {
  pid: number;
  startedAt: string;
  uptimeSeconds: number;
  platform: string;
  arch: string;
  nodeVersion: string;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
  };
  eventLoop: {
    windowSeconds: number;
    utilization: number;
    delayP50Ms: number;
    delayP99Ms: number;
    delayMaxMs: number;
  };
  activeRequests: number;
  activeWork: DaemonActiveWork;
  connections: { total: number; devices: number };
  agentRuntimes: number;
  terminals: number;
  database: {
    schemaVersion: number;
    sizeBytes: number | null;
    walBytes: number | null;
  };
  logs: { level: LogLevel; directory: string | null };
}

export type DaemonDiagnosticsLogLevel = Extract<LogLevel, "debug" | "info">;

export interface DiagnosticsHostLogDirectory {
  name: string;
  path: string;
}

export interface DiagnosticsExportInput {
  hostLogDirectories?: DiagnosticsHostLogDirectory[];
  hostMetadata?: Record<string, unknown>;
}

export interface DaemonShutdownResult {
  status: "accepted" | "busy";
  activeRequests: number;
  activeWork: DaemonActiveWork;
}

export interface DaemonBackgroundStatus {
  enabled: boolean;
  available: boolean;
  registered: boolean;
}

export interface DaemonError {
  code: string;
  message: string;
}

export interface DaemonSubscribeResult {
  epoch: string;
  replayGap: boolean;
}
