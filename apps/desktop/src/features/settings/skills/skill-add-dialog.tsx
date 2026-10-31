import type {
  InstalledSkill,
  SkillSourceSkill,
  SkillSourceSnapshot,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { FolderOpen } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Text,
} from "@/components/ui";
import { pickHostDirectoryAtom } from "@/features/workspaces";
import { useMountEffect } from "@/lib";
import { SkillInstallOptions } from "./skill-install-options";
import {
  defaultInstallChoice,
  installAgents,
  type SkillInstallChoice,
} from "./skill-library-model";
import { skillsApi } from "./skills-api";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function SourceSkillRow({
  checked,
  disabled,
  existing,
  idPrefix,
  skill,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  existing: InstalledSkill | undefined;
  idPrefix: string;
  skill: SkillSourceSkill;
  onCheckedChange(checked: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const id = `${idPrefix}-${skill.skillPath || "root"}`;
  let badge: string | null = null;
  if (!skill.installable) badge = t("skills.add.invalid");
  else if (existing?.builtin) badge = t("skills.add.builtin");
  else if (existing && checked) badge = t("skills.add.replaces");
  else if (existing) badge = t("skills.add.installed");
  return (
    <label
      className="flex cursor-pointer items-start gap-2 py-2 has-disabled:cursor-default"
      data-skill-source-path={skill.skillPath}
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <Text className="font-mono" size="body" truncate weight="medium">
            {skill.name}
          </Text>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </span>
        {skill.description ? (
          <Text className="line-clamp-2" size="meta" tone="muted">
            {skill.description}
          </Text>
        ) : null}
      </span>
    </label>
  );
}

export interface SkillAddDialogProps {
  initialSource?: string;
  initialSkillPaths?: string[];
  installed: InstalledSkill[];
  workspaceId: string | null;
  workspaceName: string | null;
  onClose(): void;
  onInstalled(): void;
}

export function SkillAddDialog({
  initialSource = "",
  initialSkillPaths,
  installed,
  workspaceId,
  workspaceName,
  onClose,
  onInstalled,
}: SkillAddDialogProps) {
  const { t } = useTranslation("settings");
  const idPrefix = useId();
  const pickDirectory = useSetAtom(pickHostDirectoryAtom);
  const [source, setSource] = useState(initialSource);
  const [snapshot, setSnapshot] = useState<SkillSourceSnapshot | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [choice, setChoice] =
    useState<SkillInstallChoice>(defaultInstallChoice);

  const existingFor = (skill: SkillSourceSkill) =>
    installed.find(
      (entry) => entry.name === skill.name && entry.scope === choice.scope,
    );
  const canSelect = (skill: SkillSourceSkill) =>
    skill.installable && !existingFor(skill)?.builtin;
  const defaultSelection = (skills: SkillSourceSkill[]) =>
    skills
      .filter((skill) =>
        initialSkillPaths
          ? initialSkillPaths.includes(skill.skillPath)
          : !existingFor(skill),
      )
      .filter(canSelect)
      .map((skill) => skill.skillPath);
  const skills = snapshot?.skills ?? [];
  const picked = (selected ?? defaultSelection(skills)).filter((skillPath) =>
    skills.some((skill) => skill.skillPath === skillPath && canSelect(skill)),
  );
  const pickedSkills = skills.filter((skill) =>
    picked.includes(skill.skillPath),
  );
  const scriptCount = pickedSkills.reduce(
    (total, skill) => total + skill.scriptCount,
    0,
  );
  const busy = isReading || isInstalling;

  const read = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setIsReading(true);
    setError("");
    setSnapshot(null);
    setSelected(null);
    try {
      setSnapshot(await skillsApi.inspectSource({ source: value }));
    } catch (readError) {
      setError(errorMessage(readError));
    } finally {
      setIsReading(false);
    }
  };

  const chooseFolder = async () => {
    const folder = await pickDirectory();
    if (folder) {
      setSource(folder);
      await read(folder);
    }
  };

  const install = async () => {
    if (!snapshot || picked.length === 0) return;
    setIsInstalling(true);
    setError("");
    try {
      const result = await skillsApi.add({
        scope: choice.scope,
        workspaceId: choice.scope === "workspace" ? workspaceId : null,
        source: snapshot.source,
        ref: snapshot.ref,
        skillPaths: picked,
        agents: installAgents(choice),
        replace: pickedSkills
          .filter((skill) => existingFor(skill))
          .map((skill) => skill.name),
      });
      onInstalled();
      if (result.installed.length > 0) {
        toast.success(
          t("skills.add.installedToast", { count: result.installed.length }),
        );
      }
      if (result.skipped.length > 0) {
        toast.message(
          t("skills.add.skippedToast", {
            names: result.skipped.map((entry) => entry.name).join(", "),
          }),
        );
      }
      onClose();
    } catch (installError) {
      setError(errorMessage(installError));
      setIsInstalling(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void read(source);
  };

  useMountEffect(() => {
    if (initialSource) {
      void read(initialSource);
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isInstalling) onClose();
      }}
    >
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("skills.add.title")}</DialogTitle>
          <DialogDescription>{t("skills.add.description")}</DialogDescription>
        </DialogHeader>
        <form className="flex items-center gap-2" onSubmit={submit}>
          <Input
            aria-label={t("skills.add.sourceLabel")}
            autoFocus={!initialSource}
            className="min-w-0 flex-1 font-mono"
            disabled={busy}
            placeholder={t("skills.add.sourcePlaceholder")}
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <Button
            disabled={busy || !source.trim()}
            type="submit"
            variant="outline"
          >
            {isReading ? <Spinner size="sm" /> : null}
            {t("skills.add.read")}
          </Button>
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => void chooseFolder()}
          >
            <FolderOpen className="size-4" />
            {t("skills.add.chooseFolder")}
          </Button>
        </form>
        {snapshot ? (
          <div className="flex min-w-0 flex-col gap-4">
            <fieldset
              aria-label={t("skills.add.found", { count: skills.length })}
              className="flex max-h-[min(18rem,40vh)] min-w-0 flex-col divide-y divide-border/60 overflow-y-auto"
            >
              {skills.length === 0 ? (
                <Text className="py-2" size="body" tone="muted">
                  {t("skills.add.none")}
                </Text>
              ) : null}
              {skills.map((skill) => (
                <SourceSkillRow
                  checked={picked.includes(skill.skillPath)}
                  disabled={busy || !canSelect(skill)}
                  existing={existingFor(skill)}
                  idPrefix={idPrefix}
                  key={skill.skillPath || skill.name}
                  skill={skill}
                  onCheckedChange={(checked) =>
                    setSelected(
                      checked
                        ? [...picked, skill.skillPath]
                        : picked.filter((path) => path !== skill.skillPath),
                    )
                  }
                />
              ))}
            </fieldset>
            <SkillInstallOptions
              choice={choice}
              disabled={busy}
              scriptCount={scriptCount}
              workspaceName={workspaceName}
              onChange={setChoice}
            />
          </div>
        ) : null}
        {error ? (
          <Text role="alert" size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
        <DialogFooter>
          <Button
            disabled={isInstalling}
            type="button"
            variant="outline"
            onClick={onClose}
          >
            {t("skills.actions.cancel")}
          </Button>
          <Button
            disabled={!snapshot || picked.length === 0 || busy}
            type="button"
            onClick={() => void install()}
          >
            {isInstalling ? <Spinner size="sm" /> : null}
            {t("skills.add.install", { count: picked.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
