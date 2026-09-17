import {
  supportsAgentTeam,
  TEAM_MAX_MEMBERS,
  TEAM_NAME_PATTERN,
  type TeamTemplateMember,
  type TeamTemplateRecord,
} from "@cocurdex/shared";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSelect } from "@/components";
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Textarea,
} from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAgentRoles, subscribeAgentRoles } from "../agent-role";
import { saveTeamTemplateRecord } from "./team-template-store";

const NO_ROLE = "__none__";

type MemberDraft = TeamTemplateMember & { key: string };

function draftMember(member?: TeamTemplateMember): MemberDraft {
  return {
    key: crypto.randomUUID(),
    name: member?.name ?? "",
    agentRoleId: member?.agentRoleId ?? null,
    prompt: member?.prompt ?? "",
  };
}

export function TeamTemplateEditDialog({
  template,
  open,
  onOpenChange,
}: {
  template: TeamTemplateRecord | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  if (!open) return null;
  return (
    <TeamTemplateForm
      key={template?.id ?? "new"}
      onOpenChange={onOpenChange}
      template={template}
    />
  );
}

function TeamTemplateForm({
  template,
  onOpenChange,
}: {
  template: TeamTemplateRecord | null;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation("settings");
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const [name, setName] = useState(template?.name ?? "");
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    template ? template.members.map(draftMember) : [draftMember()],
  );
  const [saving, setSaving] = useState(false);

  const updateMember = (index: number, patch: Partial<TeamTemplateMember>) =>
    setMembers((current) =>
      current.map((member, i) =>
        i === index ? { ...member, ...patch } : member,
      ),
    );
  const valid =
    name.trim().length > 0 &&
    members.length > 0 &&
    members.every((member) => TEAM_NAME_PATTERN.test(member.name)) &&
    new Set(members.map((member) => member.name)).size === members.length;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await saveTeamTemplateRecord({
        ...(template ? { id: template.id } : {}),
        name: name.trim(),
        members: members.map(({ key: _key, ...member }) => member),
      });
      toast.success(t("teams.saved"));
      onOpenChange(false);
    } catch {
      setSaving(false);
      toast.error(t("teams.saveFailed"));
    }
  };

  const roleOptions = [
    { value: NO_ROLE, label: t("teams.inheritRole") },
    ...roles
      .filter((role) => supportsAgentTeam(role.agentId))
      .map((role) => ({ value: role.id, label: role.name })),
  ];

  return (
    <Dialog disablePointerDismissal onOpenChange={onOpenChange} open>
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>
            {template ? t("teams.editTitle") : t("teams.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <FieldGroup className="pb-2">
            <Field>
              <FieldLabel htmlFor="team-template-name">
                {t("teams.name")}
              </FieldLabel>
              <Input
                autoFocus
                id="team-template-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("teams.namePlaceholder")}
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel>{t("teams.members")}</FieldLabel>
              <ul className="flex flex-col gap-3">
                {members.map((member, index) => (
                  <li
                    className="flex flex-col gap-2 rounded-card border border-border/70 p-3"
                    key={member.key}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={t("teams.memberName")}
                        className="flex-1"
                        maxLength={32}
                        onChange={(event) =>
                          updateMember(index, {
                            name: event.target.value.toLowerCase(),
                          })
                        }
                        placeholder={t("teams.memberNamePlaceholder")}
                        value={member.name}
                      />
                      <AppSelect
                        onValueChange={(value) =>
                          updateMember(index, {
                            agentRoleId: value === NO_ROLE ? null : value,
                          })
                        }
                        options={roleOptions}
                        triggerAriaLabel={t("teams.role")}
                        value={member.agentRoleId ?? NO_ROLE}
                      />
                      <IconButton
                        aria-label={t("teams.removeMember")}
                        disabled={members.length === 1}
                        onClick={() =>
                          setMembers((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        size="sm"
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                    <Textarea
                      aria-label={t("teams.memberPrompt")}
                      onChange={(event) =>
                        updateMember(index, { prompt: event.target.value })
                      }
                      placeholder={t("teams.memberPromptPlaceholder")}
                      rows={3}
                      value={member.prompt}
                    />
                  </li>
                ))}
              </ul>
              <Button
                className="self-start"
                disabled={members.length >= TEAM_MAX_MEMBERS}
                onClick={() =>
                  setMembers((current) => [...current, draftMember()])
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="size-3.5" />
                {t("teams.addMember")}
              </Button>
            </Field>
          </FieldGroup>
          <DialogFooter className="py-3">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  {t("teams.cancel")}
                </Button>
              }
            />
            <Button disabled={!valid || saving} type="submit">
              {t("teams.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
