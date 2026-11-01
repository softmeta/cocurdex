import { secureStorage } from "@/storage";
import { iosPushDevice } from "./push-device";
import { createPushRegistrar } from "./push-registrar";

export const pushRegistrar = createPushRegistrar(secureStorage, iosPushDevice);

export function enablePushNotifications() {
  void pushRegistrar.enable().catch(() => undefined);
}
