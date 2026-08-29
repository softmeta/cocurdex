import type {
  AgentId,
  AgentSessionMode,
  CollaborationModeKind,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import {
  supportsPlanMode,
  usesAgentAxisForCollaboration,
} from "./collaboration-mode";
import { RuntimeAxisSubmenu } from "./provider-model";

interface CollaborationModeSubmenuProps {
  agentType: AgentId;
  mode: CollaborationModeKind;
  runtimeMode?: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  runtimeModeDisabled?: boolean;
  onChange?(mode: CollaborationModeKind): void;
  onRuntimeModeChange?(modeId: string): void;
}

export function CollaborationModeSubmenu({
  agentType,
  mode,
  runtimeMode,
  runtimeModeDisabled = false,
  onChange,
  onRuntimeModeChange,
}: CollaborationModeSubmenuProps) {
  const { t } = useTranslation("sessions");

  if (runtimeMode && runtimeMode.availableModes.length > 1) {
    return (
      <RuntimeAxisSubmenu
        label={t("collaborationMode.label")}
        options={runtimeMode.availableModes.map((runtimeOption) => ({
          value: runtimeOption.id,
          label: runtimeOption.name,
          description: runtimeOption.description,
          disabled: runtimeModeDisabled,
        }))}
        value={runtimeMode.currentModeId}
        onValueChange={(value) => onRuntimeModeChange?.(value)}
      />
    );
  }

  if (usesAgentAxisForCollaboration(agentType)) {
    return null;
  }

  return supportsPlanMode(agentType) ? (
    <RuntimeAxisSubmenu
      label={t("collaborationMode.label")}
      options={[
        {
          value: "default",
          label: t("collaborationMode.default"),
        },
        {
          value: "plan",
          label: t("collaborationMode.plan"),
        },
      ]}
      value={mode}
      onValueChange={(value) => onChange?.(value as CollaborationModeKind)}
    />
  ) : null;
}
