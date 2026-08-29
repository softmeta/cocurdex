export type DesktopLogLevel = "debug" | "info" | "warn" | "error";

export const COCURDEX_DAEMON_DIAGNOSTIC_PREFIX = "[CocurdexDaemonDiagnostic] ";

export type DesktopLogDetails =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined;

export interface RendererLogPayload {
  level: DesktopLogLevel;
  scope: string;
  event: string;
  details?: DesktopLogDetails;
}

export interface DiagnosticsExportResult {
  outputPath: string;
  fileCount: number;
}
