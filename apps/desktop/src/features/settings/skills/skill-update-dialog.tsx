import type {
  InstalledSkill,
  SkillFileChange,
  SkillUpdatePreview,
} from "@cocurdex/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Text,
} from "@/components/ui";
import { useMountEffect } from "@/lib";
import { SkillFilePatch } from "./skill-file-patch-lazy";
import { shortCommit, skillRef } from "./skill-library-model";
import { skillsApi } from "./skills-api";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function FileChangeRow({
  change,
  defaultOpen,
}: {
  change: SkillFileChange;
  defaultOpen: boolean;
}) {
  const { t } = useTranslation("settings");
  return (
    <Collapsible
      className="flex flex-col"
      data-item-path={change.path}
      defaultOpen={defaultOpen && change.patch !== null}
    >
      <CollapsibleTrigger
        className="group flex h-8 w-full items-center gap-2 rounded-control px-1 text-start hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
        disabled={change.patch === null}
      >
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90 group-disabled:invisible" />
        <Text className="min-w-0 flex-1 font-mono" size="meta" truncate>
          {change.path}
        </Text>
        {change.kind === "script" ? (
          <Badge variant="outline">{t("skills.update.script")}</Badge>
        ) : null}
        <Text className="shrink-0" size="meta" tone="muted">
          {t(`skills.update.status.${change.status}`)}
        </Text>
        {change.patch === null ? (
          <Text className="shrink-0" size="meta" tone="muted">
            {t("skills.update.noPreview")}
          </Text>
        ) : (
          <Text className="shrink-0 tabular-nums" size="meta" tone="muted">
            {`+${change.additions} −${change.deletions}`}
          </Text>
        )}
      </CollapsibleTrigger>
      {change.patch === null ? null : (
        <CollapsibleContent className="overflow-hidden rounded-control border border-border/60">
          <SkillFilePatch path={change.path} patch={change.patch} />
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function SkillUpdateDialog({
  skill,
  onClose,
  onUpdated,
}: {
  skill: InstalledSkill;
  onClose(): void;
  onUpdated(): void;
}) {
  const { t } = useTranslation("settings");
  const ref = skillRef(skill);
  const [preview, setPreview] = useState<SkillUpdatePreview | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"update" | "skip" | null>(null);

  useMountEffect(() => {
    let active = true;
    skillsApi.previewUpdate(ref).then(
      (next) => {
        if (active) setPreview(next);
      },
      (previewError) => {
        if (active) setError(errorMessage(previewError));
      },
    );
    return () => {
      active = false;
    };
  });

  const perform = async (kind: "update" | "skip") => {
    if (!preview) return;
    setAction(kind);
    setError("");
    try {
      if (kind === "update") {
        await skillsApi.applyUpdates([ref]);
      } else {
        await skillsApi.skipUpdate({
          ...ref,
          latestCommit: preview.latestCommit,
        });
      }
      onUpdated();
      onClose();
    } catch (actionError) {
      setError(errorMessage(actionError));
      setAction(null);
    }
  };

  const close = (open: boolean) => {
    if (!open && action === null) onClose();
  };
  const firstPatch = preview?.changes.find((change) => change.patch !== null);

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>
            {t("skills.update.title", { name: skill.name })}
          </DialogTitle>
          <DialogDescription>
            {t("skills.update.description", {
              source: preview?.source ?? skill.source?.source ?? "",
              commit: shortCommit(skill.update?.latestCommit) ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <section
          aria-busy={!preview && !error}
          aria-label={t("skills.update.changes")}
          className="flex max-h-[min(32rem,60vh)] min-w-0 flex-col gap-1 overflow-y-auto"
        >
          {preview?.localModified ? (
            <Text as="div" className="pb-2" size="meta" tone="destructive">
              {t("skills.update.localModified")}
            </Text>
          ) : null}
          {preview && preview.changes.length === 0 ? (
            <Text size="body" tone="muted">
              {t("skills.update.noChanges")}
            </Text>
          ) : null}
          {preview?.changes.map((change) => (
            <FileChangeRow
              change={change}
              defaultOpen={change === firstPatch}
              key={change.path}
            />
          ))}
        </section>
        {error ? (
          <Text role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
        <DialogFooter>
          <Button
            className="me-auto"
            disabled={!preview || action !== null}
            variant="ghost"
            onClick={() => void perform("skip")}
          >
            {action === "skip" ? <Spinner size="sm" /> : null}
            {t("skills.update.skip")}
          </Button>
          <Button
            disabled={action !== null}
            variant="outline"
            onClick={onClose}
          >
            {t("skills.actions.cancel")}
          </Button>
          <Button
            disabled={!preview || action !== null}
            onClick={() => void perform("update")}
          >
            {action === "update" ? <Spinner size="sm" /> : null}
            {t("skills.update.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
