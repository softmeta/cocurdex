import { describe, expect, it, vi } from "vitest";
import type {
  AcpConnection,
  AcpConnectionFactory,
} from "../acp/acp-connection";
import {
  GROK_BUILD_BILLING_METHOD,
  parseGrokBuildRateLimits,
  readGrokBuildRateLimits,
} from "./grok-build-rate-limits";

describe("parseGrokBuildRateLimits", () => {
  it("maps the current weekly Grok credit period", () => {
    expect(
      parseGrokBuildRateLimits({
        result: {
          config: {
            creditUsagePercent: 63.5,
            currentPeriod: {
              type: "USAGE_PERIOD_TYPE_WEEKLY",
              end: "2026-08-10T00:00:00Z",
            },
          },
        },
      })?.windows,
    ).toEqual([
      {
        kind: "weekly",
        resetsAt: "2026-08-10T00:00:00.000Z",
        usedPercent: 63.5,
      },
    ]);
  });

  it("returns no snapshot when billing usage is unavailable", () => {
    expect(parseGrokBuildRateLimits({ config: null })).toBeNull();
  });
});

describe("readGrokBuildRateLimits", () => {
  it("authenticates then reads x.ai/billing without opening a session", async () => {
    const close = vi.fn();
    const connection = {
      initialize: vi.fn(async () => ({
        protocolVersion: 1,
        authMethods: [{ id: "cached_token" }, { id: "xai.api_key" }],
      })),
      authenticate: vi.fn(async () => ({})),
      extRequest: vi.fn(async () => ({
        result: {
          config: {
            creditUsagePercent: 44,
            currentPeriod: {
              type: "USAGE_PERIOD_TYPE_WEEKLY",
              end: "2026-09-10T00:00:00Z",
            },
          },
        },
      })),
      newSession: vi.fn(async () => {
        throw new Error("probe must not call session/new");
      }),
      close,
    } as unknown as AcpConnection;
    const factory = vi.fn(
      async () => connection,
    ) as unknown as AcpConnectionFactory;

    const record = await readGrokBuildRateLimits(factory);

    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: expect.stringMatching(/^(cached_token|xai\.api_key)$/),
    });
    expect(connection.extRequest).toHaveBeenCalledWith(
      GROK_BUILD_BILLING_METHOD,
      {},
    );
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(record?.windows).toEqual([
      expect.objectContaining({ kind: "weekly", usedPercent: 44 }),
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns null when billing is unavailable", async () => {
    const connection = {
      initialize: vi.fn(async () => ({ protocolVersion: 1 })),
      authenticate: vi.fn(async () => ({})),
      extRequest: vi.fn(async () => {
        throw new Error("unauthenticated");
      }),
      close: vi.fn(),
    } as unknown as AcpConnection;

    await expect(
      readGrokBuildRateLimits(async () => connection),
    ).resolves.toBeNull();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});
