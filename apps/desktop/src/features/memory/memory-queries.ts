import { DEFAULT_MEMORY_SETTINGS } from "@cocurdex/shared";
import useSWR, { mutate } from "swr";
import { desktopApi } from "@/lib";
import { useMountEffect } from "@/lib/react-hooks";

export const MEMORY_STATUS_KEY = "memory.status";
export const MEMORY_SETTINGS_KEY = "memory.settings";

const MEMORY_AREAS = new Set(["memory"]);

function isMemoryKey(key: unknown) {
  return (
    key === MEMORY_STATUS_KEY ||
    key === MEMORY_SETTINGS_KEY ||
    (Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0].startsWith("memory."))
  );
}

export function revalidateMemory() {
  return mutate(isMemoryKey);
}

function useMemoryRevalidation() {
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.some((area) => MEMORY_AREAS.has(area))) {
        void revalidateMemory();
      }
    }),
  );
}

export function useMemoryStatus() {
  useMemoryRevalidation();
  return useSWR(MEMORY_STATUS_KEY, () => desktopApi.getMemoryStatus(), {
    dedupingInterval: 0,
  });
}

export function useMemorySettings() {
  useMemoryRevalidation();
  return useSWR(MEMORY_SETTINGS_KEY, () => desktopApi.getMemorySettings(), {
    dedupingInterval: 0,
    fallbackData: DEFAULT_MEMORY_SETTINGS,
  });
}
