import { DEFAULT_MEMORY_SETTINGS, type MemoryStatus } from "@cocurdex/shared";
import { atom, useAtom } from "jotai";
import { desktopApi } from "@/lib";
import { revalidateMemory, useMemoryStatus } from "./memory-queries";

export type MemoryOnboardingStage =
  | "hidden"
  | "off"
  | "installing"
  | "failed"
  | "ready";

const memoryEnablingAtom = atom(false);
const memoryEnableFailureAtom = atom<string | null>(null);

function onboardingStage(
  status: MemoryStatus | undefined,
  working: boolean,
): MemoryOnboardingStage {
  if (!status?.supported) return "hidden";
  if (working || status.installation === "installing") return "installing";
  if (status.settings.enabled && status.available && status.error)
    return "failed";
  if (status.settings.enabled && status.available) return "ready";
  if (status.settings.enabled && status.installation === "failed") {
    return "failed";
  }
  // The daemon installs an enabled store on its own.
  return status.settings.enabled ? "installing" : "off";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useMemoryOnboarding() {
  const { data: status } = useMemoryStatus();
  const [working, setWorking] = useAtom(memoryEnablingAtom);
  const [failure, setFailure] = useAtom(memoryEnableFailureAtom);
  const stage = onboardingStage(status, working);

  const enable = async () => {
    setWorking(true);
    setFailure(null);
    try {
      const settings = status?.settings ?? DEFAULT_MEMORY_SETTINGS;
      if (!settings.enabled) {
        await desktopApi.setMemorySettings({ ...settings, enabled: true });
      }
      if (!status?.available) {
        const result = await desktopApi.installMemory(true);
        if (!result.installed) setFailure(result.message);
      }
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setWorking(false);
      void revalidateMemory().catch(() => undefined);
    }
  };

  return {
    stage,
    status,
    failure: failure ?? status?.error ?? null,
    enable,
  };
}
