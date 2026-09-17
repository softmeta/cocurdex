import type { AgentId, AgentSessionMode } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { usesAgentAxisForCollaboration } from "./collaboration-mode";
import { RuntimeAxisSubmenu } from "./provider-model";
import { useSessionModeLabels } from "./session-mode-label";

interface SessionModeSubmenuProps {
  agentType: AgentId;
  inspectOnly?: boolean;
  modeId: string | null;
  modes: AgentSessionMode[];
  runtimeMode?: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  runtimeModeDisabled?: boolean;
  onChange?(modeId: string): void;
  onRuntimeModeChange?(modeId: string): void;
}

export function SessionModeSubmenu({
  agentType,
  inspectOnly = false,
  modeId,
  modes,
  runtimeMode,
  runtimeModeDisabled = false,
  onChange,
  onRuntimeModeChange,
}: SessionModeSubmenuProps) {
  const { t } = useTranslation("sessions");
  const { description, label } = useSessionModeLabels();

  if (usesAgentAxisForCollaboration(agentType)) {
    return null;
  }

  if (runtimeMode && runtimeMode.availableModes.length > 0) {
    return (
      <RuntimeAxisSubmenu
        inspectOnly={inspectOnly}
        label={t("sessionMode.label")}
        options={runtimeMode.availableModes.map((mode) => ({
          value: mode.id,
          label: label(agentType, mode),
          description: description(agentType, mode),
          disabled: runtimeModeDisabled,
        }))}
        value={runtimeMode.currentModeId}
        onValueChange={(value) => onRuntimeModeChange?.(value)}
      />
    );
  }

  if (modes.length <= 1) {
    return null;
  }

  return (
    <RuntimeAxisSubmenu
      inspectOnly={inspectOnly}
      label={t("sessionMode.label")}
      options={modes.map((mode) => ({
        value: mode.id,
        label: label(agentType, mode),
        description: description(agentType, mode),
      }))}
      value={modeId ?? ""}
      onValueChange={(value) => onChange?.(value)}
    />
  );
}
