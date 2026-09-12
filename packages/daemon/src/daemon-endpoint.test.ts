import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeDaemonEndpoint } from "./daemon-endpoint";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("daemon endpoint evidence", () => {
  it.each(["ENOENT", "ECONNREFUSED"])("accepts %s as absence", async (code) => {
    const socket = new net.Socket();
    vi.spyOn(net, "connect").mockReturnValue(socket);
    const result = probeDaemonEndpoint("unused");
    socket.emit("error", Object.assign(new Error(code), { code }));
    await expect(result).resolves.toBe("absent");
    expect(socket.destroyed).toBe(true);
  });

  it.each([
    "EPERM",
    "EACCES",
    "EMFILE",
  ])("does not turn %s into permission to replace", async (code) => {
    const socket = new net.Socket();
    vi.spyOn(net, "connect").mockReturnValue(socket);
    const result = probeDaemonEndpoint("unused");
    socket.emit("error", Object.assign(new Error(code), { code }));
    await expect(result).rejects.toMatchObject({ code });
  });

  it("rejects an inconclusive timeout and closes the probe", async () => {
    vi.useFakeTimers();
    const socket = new net.Socket();
    vi.spyOn(net, "connect").mockReturnValue(socket);
    const result = expect(probeDaemonEndpoint("unused")).rejects.toThrow(
      "probe timed out",
    );
    await vi.runAllTimersAsync();
    await result;
    expect(socket.destroyed).toBe(true);
  });
});
