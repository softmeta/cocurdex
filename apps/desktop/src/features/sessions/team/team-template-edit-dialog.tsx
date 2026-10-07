import {
  type AgentRoleAvatar as AgentRoleAvatarValue,
  type AgentRoleRecord,
  supportsAgentTeam,
  TEAM_MAX_MEMBERS,
  TEAM_MIN_MEMBERS,
  TEAM_TEMPLATE_DESCRIPTION_MAX_LENGTH,
  type TeamTemplateMember,
  type TeamTemplateRecord,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  IconButton,
  Input,
  Text,
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
import {
  AgentRoleForm,
  blankRoleDraft,
  getAgentRoles,
  subscribeAgentRoles,
} from "../agent-role";
import { AgentRoleAvatarPicker } from "../agent-role/agent-role-avatar-picker";
import { agentsAtom } from "../session-store";
import { TeamMemberRow } from "./team-member-row";
import { saveTeamTemplateRecord } from "./team-template-store";

type MemberDraft = TeamTemplateMember & { key: string };

function draftMember(member?: TeamTemplateMember): MemberDraft {
  return {
    key: crypto.randomUUID(),
    agentRoleId: member?.agentRoleId ?? "",
    prompt: member?.prompt ?? "",
  };
}

function initialMembers(roles: readonly AgentRoleRecord[]) {
  const lead = draftMember({
    agentRoleId: nextFreeRoleId(roles, []),
    prompt: "",
  });
  const teammate = draftMember({
    agentRoleId: nextFreeRoleId(roles, [lead]),
    prompt: "",
  });
  return [lead, teammate];
}

function nextFreeRoleId(
  roles: readonly AgentRoleRecord[],
  members: readonly MemberDraft[],
) {
  const taken = new Set(members.map((member) => member.agentRoleId));
  return (
    roles.find((role) => supportsAgentTeam(role.agentId) && !taken.has(role.id))
      ?.id ?? ""
  );
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
  const [avatarSeed] = useState(() => template?.id ?? crypto.randomUUID());
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [avatar, setAvatar] = useState<AgentRoleAvatarValue | null>(
    template?.avatar ?? null,
  );
  const agents = useAtomValue(agentsAtom);
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    template ? template.members.map(draftMember) : initialMembers(roles),
  );
  const [creatingRoleFor, setCreatingRoleFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateMember = (key: string, patch: Partial<TeamTemplateMember>) =>
    setMembers((current) =>
      current.map((member) =>
        member.key === key ? { ...member, ...patch } : member,
      ),
    );
  const removeMember = (key: string) =>
    setMembers((current) => current.filter((member) => member.key !== key));
  const makeLead = (key: string) =>
    setMembers((current) => [
      ...current.filter((member) => member.key === key),
      ...current.filter((member) => member.key !== key),
    ]);
  const memberRoleIds = new Set(members.map((member) => member.agentRoleId));
  const valid =
    name.trim().length > 0 &&
    members.length >= TEAM_MIN_MEMBERS &&
    memberRoleIds.size === members.length &&
    members.every((member) =>
      roles.some((role) => role.id === member.agentRoleId),
    );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await saveTeamTemplateRecord({
        ...(template ? { id: template.id } : {}),
        name: name.trim(),
        description: description.trim() || null,
        avatar,
        members: members.map(({ key: _key, ...member }) => member),
      });
      toast.success(t("teams.saved"));
      onOpenChange(false);
    } catch {
      setSaving(false);
      toast.error(t("teams.saveFailed"));
    }
  };

  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen && creatingRoleFor) {
          setCreatingRoleFor(null);
          return;
        }
        onOpenChange(nextOpen);
      }}
      open
    >
      <DialogContent>
        {creatingRoleFor ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-1.5">
                <IconButton
                  aria-label={t("teams.backToTeam")}
                  className="-ms-1.5"
                  onClick={() => setCreatingRoleFor(null)}
                  size="sm"
                >
                  <ArrowLeft className="size-4 rtl:rotate-180" />
                </IconButton>
                {t("agentRoles.createTitle")}
              </DialogTitle>
            </DialogHeader>
            <AgentRoleForm
              role={blankRoleDraft(agents)}
              onCancel={() => setCreatingRoleFor(null)}
              onSaved={(saved) => {
                updateMember(creatingRoleFor, { agentRoleId: saved.id });
                setCreatingRoleFor(null);
              }}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {template ? t("teams.editTitle") : t("teams.createTitle")}
              </DialogTitle>
            </DialogHeader>
            <form className="contents" onSubmit={handleSubmit}>
              <FieldGroup className="-mx-1 max-h-[min(70vh,36rem)] gap-5 overflow-y-auto px-1 pb-2">
                <div className="flex items-start gap-3">
                  <AgentRoleAvatarPicker
                    placeholder={<Users className="size-4" />}
                    role={{ id: avatarSeed, name, avatar }}
                    onChange={setAvatar}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Input
                      aria-label={t("teams.name")}
                      autoFocus
                      maxLength={80}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={t("teams.namePlaceholder")}
                      value={name}
                    />
                    <Textarea
                      aria-label={t("teams.teamDescription")}
                      className="max-h-32 min-h-16"
                      maxLength={TEAM_TEMPLATE_DESCRIPTION_MAX_LENGTH}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t("teams.teamDescriptionPlaceholder")}
                      value={description}
                    />
                  </div>
                </div>
                <FieldSeparator />
                <Field className="gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <FieldLabel>{t("teams.members")}</FieldLabel>
                      <Text size="meta" tone="muted">
                        {t("teams.memberCount", {
                          current: members.length,
                          max: TEAM_MAX_MEMBERS,
                        })}
                      </Text>
                    </div>
                    <Button
                      className="-me-2"
                      disabled={members.length >= TEAM_MAX_MEMBERS}
                      onClick={() =>
                        setMembers((current) => [
                          ...current,
                          draftMember({
                            agentRoleId: nextFreeRoleId(roles, current),
                            prompt: "",
                          }),
                        ])
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="size-3.5" />
                      {t("teams.addMember")}
                    </Button>
                  </div>
                  <FieldDescription>{t("teams.membersHint")}</FieldDescription>
                  <ul className="flex flex-col divide-y divide-border/60">
                    {members.map((member, index) => (
                      <TeamMemberRow
                        isLead={index === 0}
                        key={member.key}
                        member={member}
                        removable={members.length > TEAM_MIN_MEMBERS}
                        roles={roles}
                        takenRoleIds={memberRoleIds}
                        onChange={(patch) => updateMember(member.key, patch)}
                        onCreateRole={() => setCreatingRoleFor(member.key)}
                        onMakeLead={() => makeLead(member.key)}
                        onRemove={() => removeMember(member.key)}
                      />
                    ))}
                  </ul>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
