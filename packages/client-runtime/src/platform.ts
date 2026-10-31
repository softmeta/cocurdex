import type { DaemonTransport } from "@cocurdex/rpc/client";
import type { ForegroundWakeup } from "./foreground-wakeup";

export interface LocalHostEndpoint {
  kind?: "local";
  webSocketUrl: string;
  token: string;
}

export interface PairedHostEndpoint {
  kind: "paired";
  baseUrl: string;
  hostId: string;
  hostKey: string;
  deviceId: string;
  deviceSecretKey: string;
}

export type HostEndpoint = LocalHostEndpoint | PairedHostEndpoint;

export interface NetworkSignal {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export interface LifecycleSignal {
  subscribeForeground(
    listener: (wakeup?: ForegroundWakeup) => void,
  ): () => void;
}

export interface PlatformSignals {
  network?: NetworkSignal;
  lifecycle?: LifecycleSignal;
}

export interface HostPlatform extends PlatformSignals {
  resolveEndpoint(): Promise<HostEndpoint>;
  openTransport?(endpoint: HostEndpoint): DaemonTransport;
  openPairedTransport?(endpoint: PairedHostEndpoint): DaemonTransport;
}
