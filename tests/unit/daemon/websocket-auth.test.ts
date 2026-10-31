import {
  authorizeDaemonWebSocket,
  isAllowedWebSocketOrigin,
  parseWebSocketProtocolHeader,
} from "@cocurdex/daemon/internal/websocket-auth";
import { daemonWebSocketProtocols } from "@cocurdex/rpc";
import { describe, expect, it } from "vitest";

describe("daemon WebSocket authorization", () => {
  const protocols = daemonWebSocketProtocols("secret");

  it("accepts the daemon token from the desktop app and loopback pages", () => {
    for (const origin of [
      undefined,
      "app://renderer",
      "file://",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]) {
      expect(
        authorizeDaemonWebSocket({ origin, protocols, token: "secret" }),
      ).toBe(true);
    }
  });

  it("rejects connections without the daemon token", () => {
    expect(
      authorizeDaemonWebSocket({
        origin: undefined,
        protocols: [],
        token: "secret",
      }),
    ).toBe(false);
    expect(
      authorizeDaemonWebSocket({
        origin: "app://renderer",
        protocols: daemonWebSocketProtocols("guess"),
        token: "secret",
      }),
    ).toBe(false);
  });

  it("rejects remote browser origins even with the token", () => {
    expect(isAllowedWebSocketOrigin("https://evil.example")).toBe(false);
    expect(isAllowedWebSocketOrigin("chrome-extension://abc")).toBe(false);
    expect(
      authorizeDaemonWebSocket({
        origin: "https://evil.example",
        protocols,
        token: "secret",
      }),
    ).toBe(false);
  });

  it("splits the offered protocol header", () => {
    expect(
      parseWebSocketProtocolHeader("cocurdex.v1, cocurdex.token.x"),
    ).toEqual(["cocurdex.v1", "cocurdex.token.x"]);
    expect(parseWebSocketProtocolHeader(undefined)).toEqual([]);
  });
});
