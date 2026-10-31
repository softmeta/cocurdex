import type { AgentPermissionMode } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export interface PermissionModeLabel {
  label: string;
  description: string;
}

export function usePermissionModeLabels(): Record<
  AgentPermissionMode,
  PermissionModeLabel
> {
  const { t } = useTranslation("sessions");
  return {
    "claude-default": {
      label: t("permissionMode.claude-default"),
      description: t("permissionMode.descriptions.claude-default"),
    },
    "claude-accept-edits": {
      label: t("permissionMode.claude-accept-edits"),
      description: t("permissionMode.descriptions.claude-accept-edits"),
    },
    "claude-auto": {
      label: t("permissionMode.claude-auto"),
      description: t("permissionMode.descriptions.claude-auto"),
    },
    "claude-plan": {
      label: t("permissionMode.claude-plan"),
      description: t("permissionMode.descriptions.claude-plan"),
    },
    "claude-bypass-permissions": {
      label: t("permissionMode.claude-bypass-permissions"),
      description: t("permissionMode.descriptions.claude-bypass-permissions"),
    },
    "codex-read-only": {
      label: t("permissionMode.codex-read-only"),
      description: t("permissionMode.descriptions.codex-read-only"),
    },
    "codex-auto": {
      label: t("permissionMode.codex-auto"),
      description: t("permissionMode.descriptions.codex-auto"),
    },
    "codex-full-access": {
      label: t("permissionMode.codex-full-access"),
      description: t("permissionMode.descriptions.codex-full-access"),
    },
    "grok-ask": {
      label: t("permissionMode.grok-ask"),
      description: t("permissionMode.descriptions.grok-ask"),
    },
    "grok-auto": {
      label: t("permissionMode.grok-auto"),
      description: t("permissionMode.descriptions.grok-auto"),
    },
    "grok-always-approve": {
      label: t("permissionMode.grok-always-approve"),
      description: t("permissionMode.descriptions.grok-always-approve"),
    },
    "opencode-ask": {
      label: t("permissionMode.opencode-ask"),
      description: t("permissionMode.descriptions.opencode-ask"),
    },
    "opencode-allow": {
      label: t("permissionMode.opencode-allow"),
      description: t("permissionMode.descriptions.opencode-allow"),
    },
    "opencode-deny": {
      label: t("permissionMode.opencode-deny"),
      description: t("permissionMode.descriptions.opencode-deny"),
    },
  };
}
