import type {
  DaemonTransport,
  DaemonTransportConnection,
  DaemonTransportHandlers,
} from "./transport-types.ts";

interface SharedConnection {
  connection: DaemonTransportConnection;
  listeners: Set<DaemonTransportHandlers>;
  ended: boolean;
}

export function createSharedTransport(open: DaemonTransport): DaemonTransport {
  let active: SharedConnection | null = null;

  const connect = (): SharedConnection => {
    const listeners = new Set<DaemonTransportHandlers>();
    const end = (
      shared: SharedConnection,
      notify: (handlers: DaemonTransportHandlers) => void,
    ) => {
      if (shared.ended) return;
      shared.ended = true;
      if (active === shared) active = null;
      const ended = [...listeners];
      listeners.clear();
      for (const handlers of ended) notify(handlers);
    };
    const shared: SharedConnection = {
      listeners,
      ended: false,
      connection: open({
        onMessage(message) {
          for (const handlers of [...listeners]) handlers.onMessage(message);
        },
        onError(error) {
          end(shared, (handlers) => handlers.onError(error));
          shared.connection.close();
        },
        onClose() {
          end(shared, (handlers) => handlers.onClose());
        },
      }),
    };
    return shared;
  };

  return (handlers) => {
    if (!active || active.ended) active = connect();
    const shared = active;
    shared.listeners.add(handlers);
    return {
      send(message) {
        if (shared.listeners.has(handlers)) shared.connection.send(message);
      },
      close() {
        shared.listeners.delete(handlers);
      },
    };
  };
}
