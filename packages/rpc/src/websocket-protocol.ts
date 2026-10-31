export const DAEMON_WEBSOCKET_PROTOCOL = "cocurdex.v1";
const TOKEN_PROTOCOL_PREFIX = "cocurdex.token.";

export function daemonWebSocketProtocols(token: string) {
  return [DAEMON_WEBSOCKET_PROTOCOL, `${TOKEN_PROTOCOL_PREFIX}${token}`];
}

export function readDaemonWebSocketToken(protocols: Iterable<string>) {
  for (const protocol of protocols) {
    if (protocol.startsWith(TOKEN_PROTOCOL_PREFIX)) {
      return protocol.slice(TOKEN_PROTOCOL_PREFIX.length);
    }
  }
  return null;
}
