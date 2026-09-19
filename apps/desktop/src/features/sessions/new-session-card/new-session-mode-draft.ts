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
