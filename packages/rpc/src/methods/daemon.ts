import type {
  AppBootstrapData,
  DiagnosticsExportResult,
  NetworkProxySettings,
  NetworkProxyTestResult,
  PendingSettingsChangeRecord,
  SyncPullInput,
  SyncPullResult,
} from "@cocurdex/shared";
import type {
  DaemonBackgroundStatus,
  DaemonDiagnosticsLogLevel,
  DaemonHealth,
  DaemonShutdownResult,
  DaemonStatus,
  DaemonSubscribeResult,
  DiagnosticsExportInput,
} from "../daemon-status.ts";

export type DaemonRequests = {
  "daemon.status": undefined;
  "daemon.shutdownIfIdle": { pid: number; startedAt: string };
  "daemon.background.get": undefined;
  "daemon.background.set": { enabled: boolean };
  "daemon.health": undefined;
  "diagnostics.export": DiagnosticsExportInput;
  "diagnostics.logLevel.set": { level: DaemonDiagnosticsLogLevel };
  "app.bootstrap": undefined;
  "sync.pull": SyncPullInput;
  "settings.pendingChanges.list": undefined;
  "settings.pendingChanges.ack": { id: string };
  "settings.values.report": { values: Record<string, unknown> };
  "daemon.subscribe": {
    afterSeq?: number;
    epoch?: string;
    sessions?: string[];
  };
  "daemon.watchSessions": { sessions: string[] | null };
  "network.proxy.test": { settings?: NetworkProxySettings };
  "network.proxy.get": undefined;
  "network.proxy.set": { settings: NetworkProxySettings };
  "system.homeDir": undefined;
  "system.fontFamilies": undefined;
  "system.openDirectory": { path: string };
  "system.revealPath": { path: string };
};

export type DaemonResults = {
  "daemon.status": DaemonStatus;
  "daemon.shutdownIfIdle": DaemonShutdownResult;
  "daemon.background.get": DaemonBackgroundStatus;
  "daemon.background.set": DaemonBackgroundStatus;
  "daemon.health": DaemonHealth;
  "diagnostics.export": DiagnosticsExportResult;
  "diagnostics.logLevel.set": { level: DaemonDiagnosticsLogLevel };
  "app.bootstrap": AppBootstrapData;
  "sync.pull": SyncPullResult;
  "settings.pendingChanges.list": PendingSettingsChangeRecord[];
  "settings.pendingChanges.ack": null;
  "settings.values.report": null;
  "daemon.subscribe": DaemonSubscribeResult;
  "daemon.watchSessions": null;
  "network.proxy.test": NetworkProxyTestResult;
  "network.proxy.get": NetworkProxySettings;
  "network.proxy.set": NetworkProxySettings;
  "system.homeDir": string;
  "system.fontFamilies": string[];
  "system.openDirectory": null;
  "system.revealPath": null;
};
