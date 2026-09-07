import type {
  AgentRoleRecord,
  WorkflowExecutorBindings,
  WorkflowRole,
} from "@cocurdex/shared";
import { projectAgentRoleToExecutorBinding } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { SettingsSelect } from "../settings-select";

const ROLES: WorkflowRole[] = ["planner", "implementer", "reviewer"];

export function WorkflowBindingsEditor({
  bindings,
  disabled,
  roles,
  onChange,
}: {
  bindings: WorkflowExecutorBindings | null;
  disabled: boolean;
  roles: AgentRoleRecord[];
  onChange(next: WorkflowExecutorBindings | null): void;
}) {
  const { t } = useTranslation("settings");

  function optionsFor(role: WorkflowRole) {
    return roles.flatMap((record) => {
      try {
        projectAgentRoleToExecutorBinding(record, role);
        return [{ value: record.id, label: record.name }];
      } catch {
        return [];
      }
    });
  }

  function updateRole(role: WorkflowRole, roleId: string) {
    const selectedIds: Record<WorkflowRole, string | undefined> = {
      planner: bindings?.planner.agentRoleId,
      implementer: bindings?.implementer.agentRoleId,
      reviewer: bindings?.reviewer.agentRoleId,
      [role]: roleId,
    };
    try {
      onChange({
        planner: projectAgentRoleToExecutorBinding(
          findRole(roles, selectedIds.planner),
          "planner",
        ),
        implementer: projectAgentRoleToExecutorBinding(
          findRole(roles, selectedIds.implementer),
          "implementer",
        ),
        reviewer: projectAgentRoleToExecutorBinding(
          findRole(roles, selectedIds.reviewer),
          "reviewer",
        ),
      });
    } catch {
      return;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Text size="meta" tone="muted">
        {t("workflows.bindings.description")}
      </Text>
      {ROLES.map((role) => (
        <div key={role} className="flex flex-col gap-1">
          <Text size="meta">{t(`workflows.role.${role}`)}</Text>
          <SettingsSelect
            ariaLabel={t(`workflows.role.${role}`)}
            disabled={disabled}
            options={optionsFor(role)}
            placeholder={t("workflows.bindings.placeholder")}
            value={bindings?.[role]?.agentRoleId ?? ""}
            onChange={(value) => updateRole(role, value)}
          />
        </div>
      ))}
    </div>
  );
}

function findRole(roles: AgentRoleRecord[], id: string | undefined) {
  const record = roles.find((candidate) => candidate.id === id);
  if (!record) {
    throw new Error("missing role");
  }
  return record;
}
