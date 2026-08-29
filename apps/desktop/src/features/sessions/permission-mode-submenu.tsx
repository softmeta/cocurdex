import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionModeOption,
  AgentProviderSnapshot,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { RuntimeAxisSubmenu } from "./provider-model";
import {
  agentsAtom,
  getPermissionModeOptions,
  supportsPermissionModeForModel,
} from "./session-store";

interface PermissionModeSubmenuProps {
  agentType: AgentId;
  mode: AgentPermissionMode | null;
  options?: AgentPermissionModeOption[];
  providerSnapshot?: AgentProviderSnapshot | null;
  onChange(mode: AgentPermissionMode): void;
}

/**
 * Permission mode lives inside the agent dropdown (it is an agent-scoped
 * setting) so the composer keeps a single agent trigger next to the model pill.
 */
export function PermissionModeSubmenu({
  agentType,
  mode,
  options,
  providerSnapshot,
  onChange,
}: PermissionModeSubmenuProps) {
  const { t } = useTranslation("sessions");
  const agents = useAtomValue(agentsAtom);
  const modes = options ?? getPermissionModeOptions(agents, agentType);
  const isModeSupported = (nextMode: AgentPermissionMode) =>
    supportsPermissionModeForModel(agentType, nextMode, providerSnapshot);
  const selectedMode =
    mode && modes.some((option) => option.id === mode) && isModeSupported(mode)
      ? mode
      : modes.find((option) => isModeSupported(option.id))?.id;

  if (modes.length === 0 || !selectedMode) {
    return null;
  }

  return (
    <RuntimeAxisSubmenu
      label={t("permissionMode.label")}
      showDescriptions
      options={modes.map((nextMode) => {
        const supported = isModeSupported(nextMode.id);

        return {
          value: nextMode.id,
          label: t(`permissionMode.${nextMode.id}`),
          // What a mode actually allows is not obvious from its name, so the
          // explanation stays on the row instead of being hidden on hover.
          description: supported
            ? t(`permissionMode.descriptions.${nextMode.id}`)
            : t("permissionMode.unavailableForModel", {
                model:
                  providerSnapshot?.modelName ??
                  providerSnapshot?.modelId ??
                  "Haiku",
              }),
          disabled: !supported,
        };
      })}
      value={selectedMode}
      onValueChange={(value) => onChange(value as AgentPermissionMode)}
    />
  );
}
