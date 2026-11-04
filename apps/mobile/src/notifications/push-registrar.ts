import type { KeyValueStorage } from "@cocurdex/client-runtime";
import type {
  DevicePushRegistrationResult,
  PushRegistration,
} from "@cocurdex/shared";

export type RegisterWithHost = (
  registration: PushRegistration,
) => Promise<DevicePushRegistrationResult>;

export interface PushDevice {
  requestPermission(): Promise<boolean>;
  registration(): Promise<PushRegistration | null>;
}

export const PUSH_REGISTRATIONS_KEY = "cocurdex.pushRegistrations";

function readRegistrations(storage: KeyValueStorage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(PUSH_REGISTRATIONS_KEY) ?? "{}",
    );
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function fingerprint(registration: PushRegistration) {
  return [
    registration.platform,
    registration.environment,
    registration.token,
  ].join(":");
}

export function createPushRegistrar(
  storage: KeyValueStorage,
  device: PushDevice,
) {
  const live = new Map<string, RegisterWithHost>();
  let registered = readRegistrations(storage);

  const remember = (next: Record<string, string>) => {
    registered = next;
    storage.setItem(PUSH_REGISTRATIONS_KEY, JSON.stringify(next));
  };

  const sync = async (hostId: string) => {
    const register = live.get(hostId);
    if (!register) return;
    const registration = await device.registration();
    if (!registration) return;
    const current = fingerprint(registration);
    if (registered[hostId] === current) return;
    const result = await register(registration);
    if (!result.registered || !live.has(hostId)) return;
    remember({ ...registered, [hostId]: current });
  };

  return {
    hostLive(hostId: string, register: RegisterWithHost) {
      live.set(hostId, register);
      return sync(hostId);
    },
    hostRemoved(hostId: string) {
      live.delete(hostId);
      if (!(hostId in registered)) return;
      const { [hostId]: _removed, ...rest } = registered;
      remember(rest);
    },
    async enable() {
      if (!(await device.requestPermission())) return;
      await Promise.all([...live.keys()].map(sync));
    },
  };
}

export type PushRegistrar = ReturnType<typeof createPushRegistrar>;
