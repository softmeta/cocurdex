import { DaemonClientError, type DaemonTransport } from "@cocurdex/rpc/client";
import type {
  MessageCompressor,
  NoiseCrypto,
  SecureChannel,
} from "@cocurdex/secure-channel";
import { connectPairedHost } from "./host-access";
import { HostAccessError } from "./host-access-error";
import type { PairedHostEndpoint } from "./platform";

export { portableMessageCompressor } from "./portable-message-compressor";

import type { OpenSecureSocket, SecureSocketHandlers } from "./secure-socket";

export type SecureSocketConnector = (
  handlers: SecureSocketHandlers,
) => Promise<OpenSecureSocket>;

export function createSecureHostTransport(
  endpoint: PairedHostEndpoint,
  crypto?: NoiseCrypto,
  compressor?: MessageCompressor,
): DaemonTransport {
  return createSecureTransport((handlers) =>
    connectPairedHost(endpoint, { crypto, compressor, handlers }),
  );
}

export function createSecureTransport(
  connect: SecureSocketConnector,
): DaemonTransport {
  return (handlers) => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const pending: string[] = [];
    let channel: SecureChannel | null = null;
    let closeSocket: (() => void) | null = null;
    let closed = false;
    const send = (message: string) => {
      void channel
        ?.sendMessage(encoder.encode(message))
        .catch(() => closeSocket?.());
    };
    connect({
      onMessage: (message) => handlers.onMessage(decoder.decode(message)),
      onClose: () => handlers.onClose(),
    }).then(
      (opened) => {
        if (closed) {
          opened.close();
          return;
        }
        channel = opened.channel;
        closeSocket = opened.close;
        for (const message of pending.splice(0)) send(message);
      },
      (error: unknown) => {
        const rejected =
          error instanceof HostAccessError && error.reason === "invalid";
        handlers.onError(
          new DaemonClientError(
            error instanceof Error ? error.message : String(error),
            rejected ? "UNAUTHORIZED" : "TRANSPORT_ERROR",
          ),
        );
        handlers.onClose();
      },
    );
    return {
      send(message) {
        if (channel) send(message);
        else pending.push(message);
      },
      close() {
        closed = true;
        closeSocket?.();
      },
    };
  };
}
