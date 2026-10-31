import * as SecureStore from "expo-secure-store";
import { createChunkedStorage } from "./chunked-storage";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureStorage = createChunkedStorage({
  getItem: (key) => SecureStore.getItem(key, OPTIONS),
  setItem: (key, value) => SecureStore.setItem(key, value, OPTIONS),
  deleteItem: (key) => {
    void SecureStore.deleteItemAsync(key, OPTIONS).catch(() => {});
  },
});
