import {
  type GitHubDeviceCode,
  pollGitHubDeviceToken,
} from "@cocurdex/daemon/internal/github-login";
import { describe, expect, it, vi } from "vitest";

const code: GitHubDeviceCode = {
  deviceCode: "synthetic-device",
  userCode: "ABCD-1234",
  verificationUri: "https://github.com/login/device",
  intervalSeconds: 5,
  expiresInSeconds: 900,
};

function replies(...bodies: Record<string, unknown>[]) {
  const queue = [...bodies];
  return vi.fn(
    async () =>
      new Response(JSON.stringify(queue.shift() ?? {}), { status: 200 }),
  );
}

describe("GitHub device authorization", () => {
  it("keeps polling while pending, backs off on slow_down, and returns the token", async () => {
    const fetchImpl = replies(
      { error: "authorization_pending" },
      { error: "slow_down", interval: 10 },
      { access_token: "synthetic-token", scope: "repo" },
    );
    const sleep = vi.fn(async () => {});
    const token = await pollGitHubDeviceToken(
      code,
      fetchImpl,
      sleep,
      new AbortController().signal,
    );
    expect(token).toEqual({ accessToken: "synthetic-token", scope: "repo" });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 5000, 10000]);
  });

  it("stops with a readable error when the user declines or the code expires", async () => {
    const signal = new AbortController().signal;
    await expect(
      pollGitHubDeviceToken(
        code,
        replies({ error: "access_denied" }),
        async () => {},
        signal,
      ),
    ).rejects.toThrow("declined");
    let now = 0;
    await expect(
      pollGitHubDeviceToken(
        code,
        replies({ error: "authorization_pending" }),
        async (ms) => {
          now += ms * 200;
        },
        signal,
        () => now,
      ),
    ).rejects.toThrow("expired");
  });
});
