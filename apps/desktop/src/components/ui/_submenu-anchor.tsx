import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { flyoutAnchor } from "@/components/ui/_flyout";

type SetTrigger = (trigger: Element | null) => void;

const SubmenuTriggerContext = createContext<{
  trigger: Element | null;
  setTrigger: SetTrigger;
} | null>(null);

export function SubmenuAnchorProvider({ children }: { children: ReactNode }) {
  const [trigger, setTrigger] = useState<Element | null>(null);
  const value = useMemo(() => ({ trigger, setTrigger }), [trigger]);
  return (
    <SubmenuTriggerContext value={value}>{children}</SubmenuTriggerContext>
  );
}

export function useSubmenuTriggerRef(): SetTrigger | undefined {
  return useContext(SubmenuTriggerContext)?.setTrigger;
}

export function useSubmenuAnchor() {
  const trigger = useContext(SubmenuTriggerContext)?.trigger ?? null;
  return useMemo(
    () => (trigger ? flyoutAnchor(trigger) : undefined),
    [trigger],
  );
}
