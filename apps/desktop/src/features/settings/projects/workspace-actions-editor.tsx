import {
  WORKSPACE_ACTION_PLATFORMS,
  type WorkspaceAction,
  type WorkspaceActionPlatform,
} from "@cocurdex/shared";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CodeTextarea } from "@/components/code-textarea";
import { Button, Input, Text } from "@/components/ui";
import { SettingsSelect } from "../settings-select";

const ALL_PLATFORMS = "all";

function isActionPlatform(value: string): value is WorkspaceActionPlatform {
  return (WORKSPACE_ACTION_PLATFORMS as readonly string[]).includes(value);
}

const PLATFORM_LABELS: Record<WorkspaceActionPlatform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
};

export function WorkspaceActionsEditor({
  actions,
  onChange,
}: {
  actions: WorkspaceAction[];
  onChange(actions: WorkspaceAction[]): void;
}) {
  const { t } = useTranslation("settings");

  const updateAction = (id: string, patch: Partial<WorkspaceAction>) => {
    onChange(
      actions.map((action) =>
        action.id === id ? { ...action, ...patch } : action,
      ),
    );
  };

  const addAction = () => {
    onChange([
      ...actions,
      { id: crypto.randomUUID(), name: "", script: "", platform: null },
    ]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text as="p" weight="medium">
            {t("worktrees.actionsTitle")}
          </Text>
          <Text as="p" className="mt-0.5" size="meta" tone="muted">
            {t("worktrees.actionsDescription")}
          </Text>
        </div>
        <Button
          className="shrink-0"
          size="sm"
          type="button"
          variant="outline"
          onClick={addAction}
        >
          <Plus className="size-3.5" />
          {t("worktrees.addAction")}
        </Button>
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {actions.map((action) => (
          <WorkspaceActionItem
            action={action}
            key={action.id}
            onChange={(patch) => updateAction(action.id, patch)}
            onRemove={() =>
              onChange(actions.filter((item) => item.id !== action.id))
            }
          />
        ))}
      </div>
    </div>
  );
}

function WorkspaceActionItem({
  action,
  onChange,
  onRemove,
}: {
  action: WorkspaceAction;
  onChange(patch: Partial<WorkspaceAction>): void;
  onRemove(): void;
}) {
  const { t } = useTranslation("settings");

  const platformOptions = [
    { label: t("worktrees.allPlatforms"), value: ALL_PLATFORMS },
    ...WORKSPACE_ACTION_PLATFORMS.map((platform) => ({
      label: PLATFORM_LABELS[platform],
      value: platform,
    })),
  ];

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t("worktrees.actionName")}
          className="min-w-0 flex-1"
          placeholder={t("worktrees.actionNamePlaceholder")}
          value={action.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <SettingsSelect
          ariaLabel={t("worktrees.actionPlatforms")}
          className="shrink-0"
          options={platformOptions}
          value={action.platform ?? ALL_PLATFORMS}
          onChange={(next) =>
            onChange({ platform: isActionPlatform(next) ? next : null })
          }
        />
        <Button
          aria-label={t("worktrees.removeAction")}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <CodeTextarea
        className="max-h-64 min-h-16"
        placeholder={t("worktrees.actionScriptPlaceholder")}
        value={action.script}
        onChange={(script) => onChange({ script })}
      />
    </div>
  );
}
