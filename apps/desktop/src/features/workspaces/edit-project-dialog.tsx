import {
  normalizeWorkspaceRootPaths,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { FolderOpen, FolderPlus, Star, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
} from "@/components/ui";
import { pickHostDirectoryAtom } from "./host-directory-picker";
import { compactWorkspacePath } from "./workspace-path";

interface EditProjectDialogProps {
  open: boolean;
  workspace: WorkspaceRecord;
  onOpenChange(open: boolean): void;
  onRemoveWorkspace(workspaceId: string): void;
  onSave(
    workspaceId: string,
    update: { name: string; rootPaths: string[] },
  ): Promise<void>;
}

export function EditProjectDialog({
  open,
  workspace,
  onOpenChange,
  onRemoveWorkspace,
  onSave,
}: EditProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        {open ? (
          <EditProjectForm
            onCancel={() => onOpenChange(false)}
            onRemoveWorkspace={onRemoveWorkspace}
            onSave={onSave}
            workspace={workspace}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditProjectForm({
  workspace,
  onCancel,
  onRemoveWorkspace,
  onSave,
}: {
  workspace: WorkspaceRecord;
  onCancel(): void;
  onRemoveWorkspace(workspaceId: string): void;
  onSave(
    workspaceId: string,
    update: { name: string; rootPaths: string[] },
  ): Promise<void>;
}) {
  const { t } = useTranslation("sessions");
  const pickHostDirectory = useSetAtom(pickHostDirectoryAtom);
  const [name, setName] = useState(workspace.name);
  const [rootPaths, setRootPaths] = useState<string[]>(workspace.rootPaths);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAddFolder = async () => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) {
      return;
    }
    setRootPaths((current) =>
      normalizeWorkspaceRootPaths([...current, rootPath]),
    );
  };

  const handleRemoveRoot = (index: number) => {
    setRootPaths((current) => current.filter((_, i) => i !== index));
  };

  const handleMakePrimary = (index: number) => {
    setRootPaths((current) => [
      current[index],
      ...current.filter((_, i) => i !== index),
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(workspace.id, { name: name.trim(), rootPaths });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const canSave = rootPaths.length > 0 && !saving;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("workspace.editTitle")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name">{t("workspace.editNameLabel")}</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("workspace.editFoldersLabel")}</Label>
          <ul className="flex flex-col overflow-hidden rounded-card border border-border/70">
            {rootPaths.map((rootPath, index) => {
              const isPrimary = index === 0;
              return (
                <li
                  key={rootPath}
                  className="group flex items-center gap-2 border-border/60 border-b px-3 py-1.5 last:border-b-0"
                >
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  <Text
                    className="min-w-0 flex-1"
                    size="meta"
                    title={rootPath}
                    truncate
                  >
                    {compactWorkspacePath(rootPath)}
                  </Text>
                  {isPrimary ? (
                    <Text className="shrink-0" size="meta" tone="muted">
                      {t("workspace.editPrimary")}
                    </Text>
                  ) : (
                    <button
                      aria-label={t("workspace.editMakePrimary")}
                      className="flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                      title={t("workspace.editMakePrimary")}
                      type="button"
                      onClick={() => handleMakePrimary(index)}
                    >
                      <Star className="size-3.5" />
                    </button>
                  )}
                  {rootPaths.length > 1 ? (
                    <button
                      aria-label={t("workspace.editRemoveFolder")}
                      className="flex size-5 shrink-0 items-center justify-center rounded-control text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      type="button"
                      onClick={() => handleRemoveRoot(index)}
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Button
            className="self-start"
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void handleAddFolder()}
          >
            <FolderPlus className="size-3.5" />
            {t("workspace.editAddFolder")}
          </Button>
        </div>
        {saveError ? (
          <Text size="meta" tone="destructive">
            {saveError}
          </Text>
        ) : null}
      </div>
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={() => onRemoveWorkspace(workspace.id)}
        >
          {t("workspace.editRemoveProject")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("workspace.editCancel")}
          </Button>
          <Button
            disabled={!canSave}
            type="button"
            onClick={() => void handleSave()}
          >
            {t("workspace.editSave")}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
