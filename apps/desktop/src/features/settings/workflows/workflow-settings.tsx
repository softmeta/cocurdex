import type {
  WorkflowCanvasLayout,
  WorkflowDefinitionRecord,
  WorkflowDefinitionRevision,
  WorkflowExecutorBindings,
  WorkflowRunStatus,
  WorkflowTransitionOutcome,
} from "@cocurdex/shared";
import {
  createBlankWorkflowStep,
  upsertWorkflowStep,
  workflowDefinitionIssues,
  workflowTerminalNodeId,
} from "@cocurdex/shared";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Spinner, Text } from "@/components/ui";
import {
  getAgentRoles,
  subscribeAgentRoles,
} from "@/features/sessions/agent-role";
import { desktopApi, useMountEffect } from "@/lib";
import { WorkflowBindingsEditor } from "./workflow-bindings-editor";
import { WorkflowCanvasLazy } from "./workflow-canvas-lazy";
import {
  WorkflowInspector,
  type WorkflowInspectorSelection,
} from "./workflow-inspector";

export function WorkflowSettingsPanel() {
  const { t } = useTranslation("settings");
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const [definitions, setDefinitions] = useState<WorkflowDefinitionRecord[]>(
    [],
  );
  const [draft, setDraft] = useState<WorkflowDefinitionRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<WorkflowInspectorSelection>(null);
  const issues = draft ? workflowDefinitionIssues(draft.revision) : [];

  useMountEffect(() => {
    void desktopApi
      .listWorkflowDefinitions()
      .then((records) => {
        setDefinitions(records);
        setDraft(records[0] ?? null);
      })
      .catch(() => {
        toast.error(t("workflows.toast.loadFailed"));
      })
      .finally(() => setLoading(false));
  });

  function updateDraft(partial: Partial<WorkflowDefinitionRecord>) {
    if (!draft || draft.builtin) {
      return;
    }
    setDraft({ ...draft, ...partial });
    setDirty(true);
  }

  async function handleSave() {
    if (!draft || draft.builtin || issues.length > 0) {
      return;
    }
    setSaving(true);
    try {
      const saved = await desktopApi.saveWorkflowDefinition({
        id: draft.id,
        name: draft.name,
        revision: {
          ...draft.revision,
          definitionId: draft.id,
          version: draft.revision.version + 1,
        },
        layout: draft.layout,
        defaultBindings: draft.defaultBindings,
      });
      setDraft(saved);
      setDirty(false);
      setDefinitions((current) =>
        current.map((record) => (record.id === saved.id ? saved : record)),
      );
      toast.success(t("workflows.toast.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("workflows.toast.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!draft) {
      return;
    }
    try {
      const copied = await desktopApi.duplicateWorkflowDefinition(draft.id);
      setDefinitions((current) => [...current, copied]);
      setDraft(copied);
      setDirty(false);
      setSelection(null);
      toast.success(t("workflows.toast.duplicated"));
    } catch {
      toast.error(t("workflows.toast.duplicateFailed"));
    }
  }

  async function handleDelete() {
    if (!draft || draft.builtin) {
      return;
    }
    try {
      await desktopApi.deleteWorkflowDefinition(draft.id);
      const remaining = definitions.filter((record) => record.id !== draft.id);
      setDefinitions(remaining);
      setDraft(remaining[0] ?? null);
      setDirty(false);
      setSelection(null);
      toast.success(t("workflows.toast.deleted"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("workflows.toast.deleteFailed"),
      );
    }
  }

  function addStep(kind: "agent" | "gate") {
    if (!draft || draft.builtin) {
      return;
    }
    const step = createBlankWorkflowStep(
      kind,
      draft.revision.steps.map((candidate) => candidate.id),
    );
    const revision = upsertWorkflowStep(draft.revision, step);
    const layout: WorkflowCanvasLayout = {
      nodes: {
        ...draft.layout.nodes,
        [step.id]: { x: 120, y: 80 + draft.revision.steps.length * 48 },
      },
    };
    updateDraft({ revision, layout });
    setSelection({ type: "step", id: step.id });
  }

  function addTerminal(status: WorkflowRunStatus) {
    if (!draft || draft.builtin) {
      return;
    }
    const id = workflowTerminalNodeId(status);
    if (draft.layout.nodes[id]) {
      return;
    }
    updateDraft({
      layout: {
        nodes: {
          ...draft.layout.nodes,
          [id]: { x: 640, y: 80 + Object.keys(draft.layout.nodes).length * 36 },
        },
      },
    });
  }

  function handleMaxTraversals(
    from: string,
    outcome: WorkflowTransitionOutcome,
    value: number | undefined,
  ) {
    if (!draft) {
      return;
    }
    updateDraft({
      revision: {
        ...draft.revision,
        transitions: draft.revision.transitions.map((transition) =>
          transition.from === from && transition.outcome === outcome
            ? { ...transition, maxTraversals: value }
            : transition,
        ),
      },
    });
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const readOnly = Boolean(draft?.builtin);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Text tone="muted">{t("workflows.description")}</Text>
      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="flex w-56 shrink-0 flex-col gap-2">
          <div className="flex flex-col gap-1 overflow-y-auto">
            {definitions.map((record) => (
              <button
                key={record.id}
                className="rounded-control border border-border px-3 py-2 text-start hover:bg-muted"
                type="button"
                onClick={() => {
                  setDraft(record);
                  setDirty(false);
                  setSelection(null);
                }}
              >
                <Text className="block" truncate>
                  {record.name}
                </Text>
                <Text size="meta" tone="muted">
                  {record.builtin
                    ? t("workflows.builtin")
                    : t("workflows.custom")}
                </Text>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => void handleDuplicate()}
          >
            {t("workflows.duplicate")}
          </Button>
        </aside>
        <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">
          {draft ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-xs"
                  disabled={readOnly}
                  value={draft.name}
                  onChange={(event) =>
                    updateDraft({ name: event.target.value })
                  }
                />
                <Button
                  disabled={readOnly}
                  size="sm"
                  type="button"
                  onClick={() => addStep("agent")}
                >
                  {t("workflows.addAgent")}
                </Button>
                <Button
                  disabled={readOnly}
                  size="sm"
                  type="button"
                  onClick={() => addStep("gate")}
                >
                  {t("workflows.addGate")}
                </Button>
                <Button
                  disabled={readOnly}
                  size="sm"
                  type="button"
                  onClick={() => addTerminal("completed")}
                >
                  {t("workflows.addTerminal")}
                </Button>
                <Button
                  disabled={readOnly || !dirty || issues.length > 0 || saving}
                  size="sm"
                  type="button"
                  onClick={() => void handleSave()}
                >
                  {t("workflows.save")}
                </Button>
                <Button
                  disabled={readOnly}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void handleDelete()}
                >
                  {t("workflows.delete")}
                </Button>
              </div>
              {readOnly ? (
                <Text size="meta" tone="muted">
                  {t("workflows.readonlyHint")}
                </Text>
              ) : null}
              {issues.length > 0 ? (
                <ul className="rounded-card border border-border bg-muted/40 px-3 py-2">
                  {issues.map((item) => (
                    <li
                      key={`${item.code}:${item.stepId ?? ""}:${item.message}`}
                    >
                      <Text size="meta">{item.message}</Text>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden rounded-card border border-border">
                <WorkflowCanvasLazy
                  key={draft.id}
                  definition={draft.revision}
                  disabled={readOnly}
                  layout={draft.layout}
                  selection={selection}
                  onDefinitionChange={(revision: WorkflowDefinitionRevision) =>
                    updateDraft({ revision })
                  }
                  onLayoutChange={(layout) => updateDraft({ layout })}
                  onSelectionChange={setSelection}
                />
              </div>
            </>
          ) : (
            <Text tone="muted">{t("workflows.empty")}</Text>
          )}
        </div>
        {draft ? (
          <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto">
            <WorkflowInspector
              definition={draft.revision}
              disabled={readOnly}
              selection={selection}
              onChange={(revision) => updateDraft({ revision })}
              onMaxTraversalsChange={handleMaxTraversals}
            />
            <WorkflowBindingsEditor
              bindings={draft.defaultBindings}
              disabled={readOnly}
              roles={roles}
              onChange={(defaultBindings: WorkflowExecutorBindings | null) =>
                updateDraft({ defaultBindings })
              }
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
