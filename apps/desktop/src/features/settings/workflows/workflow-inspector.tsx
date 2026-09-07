import type {
  WorkflowArtifactSchemaId,
  WorkflowDefinitionRevision,
  WorkflowStepDefinition,
  WorkflowTransitionOutcome,
} from "@cocurdex/shared";
import {
  permissionProfileForWorkflowStep,
  upsertWorkflowStep,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppSelect } from "@/components";
import { Input, Text, Textarea } from "@/components/ui";
import { SettingsSelect } from "../settings-select";

const ARTIFACTS: WorkflowArtifactSchemaId[] = [
  "plan_artifact.v1",
  "change_set.v1",
  "validation_report.v1",
  "review_decision.v1",
];

const ROLES = ["planner", "implementer", "reviewer"] as const;

export type WorkflowInspectorSelection =
  | { type: "step"; id: string }
  | { type: "edge"; from: string; outcome: WorkflowTransitionOutcome }
  | null;

export function WorkflowInspector({
  definition,
  disabled,
  selection,
  onChange,
  onMaxTraversalsChange,
}: {
  definition: WorkflowDefinitionRevision;
  disabled: boolean;
  selection: WorkflowInspectorSelection;
  onChange(next: WorkflowDefinitionRevision): void;
  onMaxTraversalsChange(
    from: string,
    outcome: WorkflowTransitionOutcome,
    value: number | undefined,
  ): void;
}) {
  const { t } = useTranslation("settings");
  const step =
    selection?.type === "step"
      ? definition.steps.find((candidate) => candidate.id === selection.id)
      : undefined;
  const transition =
    selection?.type === "edge"
      ? definition.transitions.find(
          (candidate) =>
            candidate.from === selection.from &&
            candidate.outcome === selection.outcome,
        )
      : undefined;

  if (step) {
    return (
      <StepInspector
        disabled={disabled}
        step={step}
        onChange={(nextStep) =>
          onChange(upsertWorkflowStep(definition, nextStep))
        }
      />
    );
  }

  if (transition && selection?.type === "edge") {
    return (
      <div className="flex flex-col gap-3">
        <Text weight="medium">{t("workflows.inspector.edge")}</Text>
        <Text size="meta" tone="muted">
          {transition.from} → {transition.to ?? transition.terminalStatus}
        </Text>
        <div className="flex flex-col gap-1">
          <Text size="meta">{t("workflows.inspector.maxTraversals")}</Text>
          <Input
            disabled={disabled}
            min={1}
            type="number"
            value={transition.maxTraversals ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              onMaxTraversalsChange(
                transition.from,
                transition.outcome,
                raw === "" ? undefined : Number(raw),
              );
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <Text size="meta" tone="muted">
      {t("workflows.inspector.empty")}
    </Text>
  );
}

function StepInspector({
  disabled,
  step,
  onChange,
}: {
  disabled: boolean;
  step: WorkflowStepDefinition;
  onChange(step: WorkflowStepDefinition): void;
}) {
  const { t } = useTranslation("settings");

  function patch(partial: Partial<WorkflowStepDefinition>) {
    const next = { ...step, ...partial };
    onChange({
      ...next,
      permissionProfile: permissionProfileForWorkflowStep(next),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Text weight="medium">{step.id}</Text>
      {step.kind === "agent" ? (
        <>
          <div className="flex flex-col gap-1">
            <Text size="meta">{t("workflows.inspector.role")}</Text>
            <SettingsSelect
              ariaLabel={t("workflows.inspector.role")}
              disabled={disabled}
              options={ROLES.map((role) => ({
                value: role,
                label: t(`workflows.role.${role}`),
              }))}
              value={step.role ?? "planner"}
              onChange={(value) =>
                patch({ role: value as WorkflowStepDefinition["role"] })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Text size="meta">{t("workflows.inspector.output")}</Text>
            <SettingsSelect
              ariaLabel={t("workflows.inspector.output")}
              disabled={disabled}
              options={ARTIFACTS.map((schemaId) => ({
                value: schemaId,
                label: t(`workflows.artifact.${schemaId}`),
              }))}
              value={step.outputSchema ?? "plan_artifact.v1"}
              onChange={(value) =>
                patch({ outputSchema: value as WorkflowArtifactSchemaId })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Text size="meta">{t("workflows.inspector.inputs")}</Text>
            <AppSelect
              disabled={disabled}
              options={ARTIFACTS.map((schemaId) => ({
                value: schemaId,
                label: t(`workflows.artifact.${schemaId}`),
              }))}
              placeholder={t("workflows.inspector.addInput")}
              value=""
              onValueChange={(value) => {
                const schemaId = value as WorkflowArtifactSchemaId;
                if (step.inputSchemas.includes(schemaId)) {
                  return;
                }
                patch({ inputSchemas: [...step.inputSchemas, schemaId] });
              }}
            />
            <div className="flex flex-col gap-1">
              {step.inputSchemas.map((schemaId) => (
                <button
                  key={schemaId}
                  className="rounded-control px-2 py-1 text-start text-meta text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={disabled}
                  type="button"
                  onClick={() =>
                    patch({
                      inputSchemas: step.inputSchemas.filter(
                        (candidate) => candidate !== schemaId,
                      ),
                    })
                  }
                >
                  {t(`workflows.artifact.${schemaId}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Text size="meta">{t("workflows.inspector.instruction")}</Text>
            <Textarea
              disabled={disabled}
              rows={6}
              value={step.instruction ?? ""}
              onChange={(event) => patch({ instruction: event.target.value })}
            />
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-1">
        <Text size="meta">{t("workflows.inspector.maxAttempts")}</Text>
        <Input
          disabled={disabled}
          min={1}
          type="number"
          value={step.maxAttempts}
          onChange={(event) =>
            patch({ maxAttempts: Number(event.target.value) || 1 })
          }
        />
      </div>
    </div>
  );
}
