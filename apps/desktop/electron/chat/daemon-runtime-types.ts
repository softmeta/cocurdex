import type { DaemonConnectionInfo } from "@cocurdex/rpc";
import type { CocurdexDaemonEvent, DaemonEventMeta } from "@cocurdex/shared";

export interface DaemonRuntimeLogger {
  debug(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
}

export interface DaemonRuntimeClientOptions {
  daemonEntryPath: string;
  logger: DaemonRuntimeLogger;
  onEvent(event: CocurdexDaemonEvent, meta?: DaemonEventMeta): void;
  onConnected?(): void;
  userDataPath: string;
  webRoot?: string;
}

export interface DaemonRuntimeStatus {
  running: boolean;
  pid: number | null;
  protocolVersion: number | null;
  runtimeFingerprint: string | null;
  expectedRuntimeFingerprint: string | null;
  socketPath: string | null;
  startedAt: string | null;
  matchesRuntime: boolean;
  ownedByThisApp: boolean;
  error: string | null;
}

export interface DaemonRuntimeClient {
  connection(): Promise<DaemonConnectionInfo>;
  dispose(): Promise<void>;
  getStatus(): Promise<DaemonRuntimeStatus>;
  initialize(): Promise<void>;
  restart(): Promise<DaemonRuntimeStatus>;
}
