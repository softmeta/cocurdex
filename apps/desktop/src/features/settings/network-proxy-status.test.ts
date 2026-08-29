import type { NetworkProxySettings } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  listManualProxyEndpoints,
  resolveNetworkProxyStatusTone,
} from "./network-proxy-status";

const manual: NetworkProxySettings = {
  mode: "manual",
  httpProxy: "http://127.0.0.1:7890",
  httpsProxy: "",
  allProxy: "",
  noProxy: "localhost",
};

describe("resolveNetworkProxyStatusTone", () => {
  it("treats an in-flight probe as checking even if a previous result exists", () => {
    expect(
      resolveNetworkProxyStatusTone({
        settings: manual,
        result: {
          ok: true,
          durationMs: 10,
          ip: "1.1.1.1",
          city: null,
          country: null,
          org: null,
        },
        testing: true,
      }),
    ).toBe("checking");
  });

  it("flags incomplete manual mode before any probe", () => {
    expect(
      resolveNetworkProxyStatusTone({
        settings: { ...manual, httpProxy: "" },
        result: null,
        testing: false,
      }),
    ).toBe("incomplete");
  });

  it("maps probe outcome and off mode", () => {
    expect(
      resolveNetworkProxyStatusTone({
        settings: { ...manual, mode: "off" },
        result: null,
        testing: false,
      }),
    ).toBe("off");
    expect(
      resolveNetworkProxyStatusTone({
        settings: manual,
        result: {
          ok: true,
          durationMs: 8,
          ip: "8.8.8.8",
          city: null,
          country: null,
          org: null,
        },
        testing: false,
      }),
    ).toBe("ok");
    expect(
      resolveNetworkProxyStatusTone({
        settings: manual,
        result: { ok: false, durationMs: 20, error: "timeout" },
        testing: false,
      }),
    ).toBe("error");
  });
});

describe("listManualProxyEndpoints", () => {
  it("lists only the filled manual URLs", () => {
    expect(
      listManualProxyEndpoints({
        ...manual,
        httpsProxy: "http://127.0.0.1:7891",
        allProxy: "socks5://127.0.0.1:1080",
      }),
    ).toEqual([
      { field: "httpProxy", url: "http://127.0.0.1:7890" },
      { field: "httpsProxy", url: "http://127.0.0.1:7891" },
      { field: "allProxy", url: "socks5://127.0.0.1:1080" },
    ]);
    expect(listManualProxyEndpoints({ ...manual, mode: "system" })).toEqual([]);
  });
});
