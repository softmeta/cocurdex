export interface DaemonTransportHandlers {
  onMessage(message: string): void;
  onError(error: Error): void;
  onClose(): void;
}

export interface DaemonTransportConnection {
  send(message: string): void;
  close(): void;
}

export type DaemonTransport = (
  handlers: DaemonTransportHandlers,
) => DaemonTransportConnection;
