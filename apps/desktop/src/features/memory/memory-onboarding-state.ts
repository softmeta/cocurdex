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
  if (!status) return "hidden";
  if (!status.settings.enabled) return working ? "installing" : "off";
  // Memory lives in the daemon; the remaining stages follow the external
  // library the user chose. Only rsrs is set up by Cocurdex.
  if (status.settings.provider === "ai-memory") {
    return status.provider?.available === false ? "failed" : "ready";
  }
  if (status.settings.provider !== "rsrs") return "ready";
  if (working || status.installation === "installing") return "installing";
  if (status.rsrsAvailable) return status.error ? "failed" : "ready";
  // The daemon installs rsrs on its own once it is turned on.
  return status.installation === "failed" ? "failed" : "installing";
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
      if (settings.provider === "rsrs" && !status?.rsrsAvailable) {
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
    failure: failure ?? status?.provider?.error ?? status?.error ?? null,
    enable,
  };
}
