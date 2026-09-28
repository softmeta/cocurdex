import type { AgentCapabilities, AgentSessionMode } from "@cocurdex/shared";
import { atom, useAtom } from "jotai";

export const newSessionModesAtom = atom<Record<string, string | null>>({});

export function useNewSessionModeDraft(
  workspaceId: string | null | undefined,
  initialMode: string | null,
) {
  const [modes, setModes] = useAtom(newSessionModesAtom);
  const key = workspaceId ?? "_";
  const mode = key in modes ? modes[key] : initialMode;
  const setMode = (next: string | null) =>
    setModes((current) => ({ ...current, [key]: next }));
  return [mode, setMode] as const;
}

export function resolveNewSessionModeId(
  draftModeId: string | null | undefined,
  options: readonly AgentSessionMode[],
  transport: AgentCapabilities["transport"] | undefined,
): string | null {
  if (!draftModeId) {
    return null;
  }
  if (options.some((mode) => mode.id === draftModeId)) {
    return draftModeId;
  }
  const modesPendingDiscovery = transport === "acp" && options.length === 0;
  return modesPendingDiscovery ? draftModeId : null;
}
