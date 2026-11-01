import type { PushRegistration } from "@cocurdex/shared";
import { getIosPushNotificationServiceEnvironmentAsync } from "expo-application";
import {
  getDevicePushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} from "expo-notifications";
import { Platform } from "react-native";
import type { PushDevice } from "./push-registrar";

let token: Promise<PushRegistration> | null = null;

async function readRegistration(): Promise<PushRegistration> {
  const [device, environment] = await Promise.all([
    getDevicePushTokenAsync(),
    getIosPushNotificationServiceEnvironmentAsync(),
  ]);
  return {
    platform: "apns",
    token: String(device.data),
    environment: environment === "production" ? "production" : "sandbox",
  };
}

export const iosPushDevice: PushDevice = {
  async requestPermission() {
    if (Platform.OS !== "ios") return false;
    const current = await getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await requestPermissionsAsync();
    return requested.granted;
  },
  async registration() {
    if (Platform.OS !== "ios") return null;
    const permission = await getPermissionsAsync();
    if (!permission.granted) return null;
    token ??= readRegistration().catch((error: unknown) => {
      token = null;
      throw error;
    });
    return token;
  },
};
