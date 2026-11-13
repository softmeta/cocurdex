import { authorizeDaemonRequest } from "@cocurdex/daemon/internal/wire-request";
import { isUnknownDaemonMethodError } from "@cocurdex/rpc";
import { DaemonClientError } from "@cocurdex/rpc/client";
import { describe, expect, it } from "vitest";

const device = {
  kind: "device" as const,
  deviceId: "d1",
  scopes: ["read" as const, "approvals" as const],
};

describe("authorizeDaemonRequest", () => {
  it("rejects requests without a valid principal", () => {
    expect(authorizeDaemonRequest(null, "session.list", false)).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });

  it("lets the local token call anything locally but never over the remote listener", () => {
    expect(
      authorizeDaemonRequest({ kind: "local" }, "daemon.shutdownIfIdle", false),
    ).toMatchObject({ ok: true });
    expect(
      authorizeDaemonRequest({ kind: "local" }, "session.list", true),
    ).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("limits a device to the methods its scopes cover", () => {
    expect(authorizeDaemonRequest(device, "session.list", true)).toMatchObject({
      ok: true,
    });
    expect(
      authorizeDaemonRequest(device, "permission.resolve", true),
    ).toMatchObject({ ok: true });
    expect(authorizeDaemonRequest(device, "session.send", true)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      message: "This device is missing the interact scope",
    });
    expect(
      authorizeDaemonRequest(device, "host.devices.revoke", true),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(authorizeDaemonRequest(device, "toString", true)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("rejects a method the daemon lacks so a newer client can tell the host is outdated", () => {
    const result = authorizeDaemonRequest(
      device,
      "assistant.fromTheFuture",
      true,
    );
    if (result.ok) throw new Error("expected a rejection");
    const error = new DaemonClientError(result.message, result.code);
    expect(isUnknownDaemonMethodError(error)).toBe(true);

    const missingScope = authorizeDaemonRequest(device, "session.send", true);
    if (missingScope.ok) throw new Error("expected a rejection");
    expect(
      isUnknownDaemonMethodError(
        new DaemonClientError(missingScope.message, missingScope.code),
      ),
    ).toBe(false);
  });
});
