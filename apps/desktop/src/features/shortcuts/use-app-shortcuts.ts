import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";

import { type ShortcutDescriptor, useGlobalShortcuts } from "@/lib";

import {
  getShortcutDefinition,
  type ShortcutId,
  shortcutIds,
} from "./shortcut-catalog";
import { resolveShortcutCombo } from "./shortcut-resolve";
import {
  shortcutOverridesAtom,
  shortcutRecordingIdAtom,
} from "./shortcut-store";

export type ShortcutHandlerMap = Partial<
  Record<ShortcutId, (event: KeyboardEvent) => void>
>;

export type ShortcutEnabledMap = Partial<Record<ShortcutId, () => boolean>>;

/**
 * Bind catalog shortcuts to handlers. Resolves user overrides automatically
 * and pauses all shortcuts while a settings recorder is active.
 *
 * Safe to call from multiple components — each registers only the handlers
 * it supplies. Handlers/enabled maps may be recreated each render; the hook
 * reads them through refs so the keydown listener is not reattached unless
 * bindings or which ids are registered change.
 */
export function useAppShortcuts(
  handlers: ShortcutHandlerMap,
  options?: {
    enabled?: ShortcutEnabledMap;
    labels?: Partial<Record<ShortcutId, string>>;
  },
) {
  const overrides = useAtomValue(shortcutOverridesAtom);
  const recordingId = useAtomValue(shortcutRecordingIdAtom);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const enabledRef = useRef(options?.enabled);
  enabledRef.current = options?.enabled;
  const labels = options?.labels;

  const registeredKey = shortcutIds
    .map((id) => (handlers[id] ? id : ""))
    .join("|");
  const registeredIds = useMemo(() => {
    // Only re-register when the *set* of handler ids changes, not when
    // handler function identities churn.
    return registeredKey.split("|").filter(Boolean) as ShortcutId[];
  }, [registeredKey]);

  const shortcuts = useMemo(() => {
    const descriptors: ShortcutDescriptor[] = [];

    for (const id of registeredIds) {
      const definition = getShortcutDefinition(id);
      if (!definition) {
        continue;
      }

      descriptors.push({
        id,
        label: labels?.[id] ?? id,
        combo: resolveShortcutCombo(id, overrides),
        allowInEditable: definition.allowInEditable,
        enabled: () => {
          if (recordingId !== null) {
            return false;
          }
          return enabledRef.current?.[id]?.() ?? true;
        },
        handler: (event) => {
          handlersRef.current[id]?.(event);
        },
      });
    }

    return descriptors;
  }, [labels, overrides, recordingId, registeredIds]);

  useGlobalShortcuts(shortcuts);
}
