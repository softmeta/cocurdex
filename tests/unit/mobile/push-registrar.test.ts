import type { KeyValueStorage } from "@cocurdex/client-runtime";
import {
  createPushRegistrar,
  type PushDevice,
} from "@cocurdex/mobile/internal/notifications/push-registrar";
import type { PushRegistration } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function fakeDevice(granted: boolean) {
  let token = "token-a";
  let permitted = granted;
  const device: PushDevice = {
    requestPermission: vi.fn(async () => {
      permitted = true;
      return true;
    }),
    registration: async (): Promise<PushRegistration | null> =>
      permitted ? { platform: "apns", token, environment: "sandbox" } : null,
  };
  return {
    device,
    rotate(next: string) {
      token = next;
    },
  };
}

describe("push registrar", () => {
  it("registers each token with a host once, across app launches", async () => {
    const storage = memoryStorage();
    const { device, rotate } = fakeDevice(true);
    const register = vi.fn(async (_registration: PushRegistration) => ({
      registered: true,
    }));

    await createPushRegistrar(storage, device).hostLive("host-1", register);
    const relaunched = createPushRegistrar(storage, device);
    await relaunched.hostLive("host-1", register);
    rotate("token-b");
    await relaunched.hostLive("host-1", register);

    expect(register.mock.calls.map(([registration]) => registration)).toEqual([
      { platform: "apns", token: "token-a", environment: "sandbox" },
      { platform: "apns", token: "token-b", environment: "sandbox" },
    ]);
  });

  it("retries a host that had no push gateway on its next connection", async () => {
    const { device } = fakeDevice(true);
    const register = vi
      .fn()
      .mockResolvedValueOnce({ registered: false })
      .mockResolvedValue({ registered: true });
    const registrar = createPushRegistrar(memoryStorage(), device);

    await registrar.hostLive("host-1", register);
    await registrar.hostLive("host-1", register);
    await registrar.hostLive("host-1", register);

    expect(register).toHaveBeenCalledTimes(2);
  });

  it("registers connected hosts once notifications are allowed", async () => {
    const { device } = fakeDevice(false);
    const register = vi.fn(async (_registration: PushRegistration) => ({
      registered: true,
    }));
    const registrar = createPushRegistrar(memoryStorage(), device);

    await registrar.hostLive("host-1", register);
    expect(register).not.toHaveBeenCalled();
    await registrar.enable();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it("registers again after a host is removed and paired anew", async () => {
    const { device } = fakeDevice(true);
    const register = vi.fn(async (_registration: PushRegistration) => ({
      registered: true,
    }));
    const registrar = createPushRegistrar(memoryStorage(), device);

    await registrar.hostLive("host-1", register);
    registrar.hostRemoved("host-1");
    await registrar.hostLive("host-1", register);

    expect(register).toHaveBeenCalledTimes(2);
  });
});
