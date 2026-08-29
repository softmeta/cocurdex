import { describe, expect, it } from "vitest";
import {
  applyNetworkProxyToEnv,
  buildElectronProxyConfig,
  DEFAULT_NO_PROXY,
  formatProxyEgressDetail,
  getManualProxyCredentials,
  isManualProxyIncomplete,
  isValidProxyUrl,
  normalizeNetworkProxySettings,
  parseNetworkProxySettings,
  pickProxyEnv,
  redactProxyUrl,
  resolveProxyEnvAssignments,
  serializeNetworkProxySettings,
} from "./network-proxy";

describe("network-proxy", () => {
  const systemSnapshot = {
    HTTP_PROXY: "http://shell-proxy:8080",
    HTTPS_PROXY: "http://shell-proxy:8080",
    NO_PROXY: "localhost",
  };

  it("parses invalid JSON as system defaults", () => {
    const settings = parseNetworkProxySettings("not-json");
    expect(settings.mode).toBe("system");
    expect(settings.noProxy).toBe(DEFAULT_NO_PROXY);
  });

  it("round-trips serialization", () => {
    const settings = normalizeNetworkProxySettings({
      mode: "manual",
      httpProxy: " http://127.0.0.1:7890 ",
      httpsProxy: "",
      allProxy: "",
      noProxy: "localhost",
    });
    const parsed = parseNetworkProxySettings(
      serializeNetworkProxySettings(settings),
    );
    expect(parsed).toEqual({
      mode: "manual",
      httpProxy: "http://127.0.0.1:7890",
      httpsProxy: "",
      allProxy: "",
      noProxy: "localhost",
    });
  });

  it("system mode restores the shell snapshot", () => {
    const assignments = resolveProxyEnvAssignments(
      {
        mode: "system",
        httpProxy: "",
        httpsProxy: "",
        allProxy: "",
        noProxy: "",
      },
      systemSnapshot,
    );
    expect(assignments.HTTP_PROXY).toBe("http://shell-proxy:8080");
    expect(assignments.NO_PROXY).toBe("localhost");
  });

  it("off mode clears every proxy key", () => {
    const assignments = resolveProxyEnvAssignments(
      {
        mode: "off",
        httpProxy: "x",
        httpsProxy: "",
        allProxy: "",
        noProxy: "",
      },
      systemSnapshot,
    );
    expect(assignments.HTTP_PROXY).toBeUndefined();
    expect(assignments.https_proxy).toBeUndefined();
  });

  it("manual mode sets upper and lower case proxy vars", () => {
    const assignments = resolveProxyEnvAssignments(
      {
        mode: "manual",
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
        allProxy: "socks5://127.0.0.1:1080",
        noProxy: "",
      },
      systemSnapshot,
    );
    expect(assignments.HTTP_PROXY).toBe("http://127.0.0.1:7890");
    expect(assignments.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(assignments.http_proxy).toBe("http://127.0.0.1:7890");
    expect(assignments.ALL_PROXY).toBe("socks5://127.0.0.1:1080");
    expect(assignments.NO_PROXY).toBe(DEFAULT_NO_PROXY);
  });

  it("applyNetworkProxyToEnv mutates env and enables NODE_USE_ENV_PROXY", () => {
    const env: Record<string, string | undefined> = {
      HTTP_PROXY: "stale",
      PATH: "/usr/bin",
    };
    applyNetworkProxyToEnv(
      env,
      {
        mode: "manual",
        httpProxy: "http://proxy:1",
        httpsProxy: "http://proxy:1",
        allProxy: "",
        noProxy: "localhost",
      },
      systemSnapshot,
    );
    expect(env.HTTP_PROXY).toBe("http://proxy:1");
    expect(env.NODE_USE_ENV_PROXY).toBe("1");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("buildElectronProxyConfig maps modes", () => {
    expect(buildElectronProxyConfig({ mode: "off" } as never).mode).toBe(
      "direct",
    );
    expect(buildElectronProxyConfig({ mode: "system" } as never).mode).toBe(
      "system",
    );
    expect(
      buildElectronProxyConfig({
        mode: "manual",
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
        allProxy: "",
        noProxy: "localhost",
      }),
    ).toMatchObject({
      mode: "fixed_servers",
      proxyRules: "http=127.0.0.1:7890;https=127.0.0.1:7890",
      proxyBypassRules: "localhost",
    });
  });

  it("pickProxyEnv only keeps proxy keys", () => {
    expect(
      pickProxyEnv({
        HTTP_PROXY: "http://x",
        PATH: "/bin",
        NO_PROXY: "localhost",
      }),
    ).toEqual({
      HTTP_PROXY: "http://x",
      NO_PROXY: "localhost",
    });
  });

  it("isValidProxyUrl requires a scheme and host, empty means unset", () => {
    expect(isValidProxyUrl("")).toBe(true);
    expect(isValidProxyUrl("  ")).toBe(true);
    expect(isValidProxyUrl("http://127.0.0.1:7890")).toBe(true);
    expect(isValidProxyUrl("http://user:pass@host:8080")).toBe(true);
    expect(isValidProxyUrl("socks5://127.0.0.1:1080")).toBe(true);
    expect(isValidProxyUrl("127.0.0.1:7890")).toBe(false);
    expect(isValidProxyUrl("http://")).toBe(false);
    expect(isValidProxyUrl("ftp://host:21")).toBe(false);
    expect(isValidProxyUrl("not a url")).toBe(false);
  });

  it("buildElectronProxyConfig keeps non-http schemes and drops credentials", () => {
    expect(
      buildElectronProxyConfig({
        mode: "manual",
        httpProxy: "http://user:pass@127.0.0.1:7890",
        httpsProxy: "socks5h://127.0.0.1:1080",
        allProxy: "",
        noProxy: "localhost",
      }),
    ).toMatchObject({
      mode: "fixed_servers",
      proxyRules: "http=127.0.0.1:7890;https=socks5://127.0.0.1:1080",
    });
  });

  it("buildElectronProxyConfig normalizes an allProxy-only catch-all", () => {
    expect(
      buildElectronProxyConfig({
        mode: "manual",
        httpProxy: "",
        httpsProxy: "",
        allProxy: "socks5://user:pass@127.0.0.1:1080",
        noProxy: "localhost",
      }),
    ).toMatchObject({
      mode: "fixed_servers",
      proxyRules: "socks5://127.0.0.1:1080",
    });
  });

  it("getManualProxyCredentials prefers https, and only applies in manual mode", () => {
    const settings = {
      mode: "manual",
      httpProxy: "http://a:1@127.0.0.1:7890",
      httpsProxy: "http://b:2@127.0.0.1:7891",
      allProxy: "",
      noProxy: "",
    } as const;
    expect(getManualProxyCredentials(settings)).toEqual({
      username: "b",
      password: "2",
    });
    expect(
      getManualProxyCredentials({ ...settings, mode: "system" }),
    ).toBeNull();
    expect(
      getManualProxyCredentials({
        ...settings,
        httpProxy: "http://127.0.0.1:7890",
        httpsProxy: "",
      }),
    ).toBeNull();
  });

  it("isManualProxyIncomplete flags manual mode with no proxy url", () => {
    const empty = {
      mode: "manual",
      httpProxy: "",
      httpsProxy: "",
      allProxy: "",
      noProxy: "localhost",
    } as const;
    expect(isManualProxyIncomplete(empty)).toBe(true);
    expect(
      isManualProxyIncomplete({
        ...empty,
        allProxy: "socks5://127.0.0.1:1080",
      }),
    ).toBe(false);
    expect(isManualProxyIncomplete({ ...empty, mode: "off" })).toBe(false);
  });

  it("redacts proxy userinfo without changing host or port", () => {
    expect(redactProxyUrl("http://alice:s3cret@127.0.0.1:7890")).toBe(
      "http://***@127.0.0.1:7890",
    );
    expect(redactProxyUrl("socks5://127.0.0.1:1080")).toBe(
      "socks5://127.0.0.1:1080",
    );
    expect(redactProxyUrl("")).toBe("");
  });

  it("formats egress detail from a successful probe", () => {
    expect(
      formatProxyEgressDetail({
        ok: true,
        durationMs: 12,
        ip: "1.1.1.1",
        city: "San Francisco",
        country: "US",
        org: "AS13335 Cloudflare",
      }),
    ).toBe("San Francisco, US · AS13335 Cloudflare");
    expect(
      formatProxyEgressDetail({
        ok: false,
        durationMs: 4,
        error: "timeout",
      }),
    ).toBeNull();
  });
});
