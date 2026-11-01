import type { SavedHost } from "@cocurdex/client-runtime";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { secureStorage } from "@/storage";

const APP_GROUPS = "com.apple.security.application-groups";
const KEY_INDEX = "cocurdex.pushKeys";

function appGroup(): string | null {
  const groups: unknown = Constants.expoConfig?.ios?.entitlements?.[APP_GROUPS];
  if (!Array.isArray(groups) || typeof groups[0] !== "string") return null;
  return groups[0];
}

function storeOptions(accessGroup: string): SecureStore.SecureStoreOptions {
  return {
    keychainService: "dev.cocurdex.push",
    accessGroup,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
}

function readIndex(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      secureStorage.getItem(KEY_INDEX) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function itemKey(hostId: string) {
  return `device.${hostId.replace(/[^\w.-]/g, "_")}`;
}

export function mirrorPushKeys(hosts: readonly SavedHost[]) {
  const accessGroup = Platform.OS === "ios" ? appGroup() : null;
  if (!accessGroup) return;
  const options = storeOptions(accessGroup);
  try {
    for (const host of hosts) {
      const key = itemKey(host.hostId);
      if (SecureStore.getItem(key, options) === host.deviceSecretKey) continue;
      SecureStore.setItem(key, host.deviceSecretKey, options);
    }
    const paired = new Set(hosts.map((host) => host.hostId));
    for (const hostId of readIndex()) {
      if (paired.has(hostId)) continue;
      void SecureStore.deleteItemAsync(itemKey(hostId), options).catch(
        () => undefined,
      );
    }
    secureStorage.setItem(KEY_INDEX, JSON.stringify([...paired]));
  } catch {
    return;
  }
}
