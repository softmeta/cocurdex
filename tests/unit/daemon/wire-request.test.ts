import { authorizeDaemonRequest } from "@cocurdex/daemon/internal/wire-request";
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
});
