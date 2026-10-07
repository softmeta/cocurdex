import {
  type AgentRoleAvatar as AgentRoleAvatarValue,
  supportsAgentTeam,
  TEAM_MAX_MEMBERS,
  TEAM_NAME_PATTERN,
  TEAM_TEMPLATE_DESCRIPTION_MAX_LENGTH,
  type TeamTemplateMember,
  type TeamTemplateRecord,
} from "@cocurdex/shared";
import { Plus, Users, X } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppDropdownTriggerLabel, AppSelect } from "@/components";
import {
  Button,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { getAgentRoles, subscribeAgentRoles } from "../agent-role";
import { AgentRoleAvatar } from "../agent-role/agent-role-avatar";
import { AgentRoleAvatarPicker } from "../agent-role/agent-role-avatar-picker";
import { TeamMemberAvatar } from "./team-member-avatar";
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

function isMemberNameInvalid(member: MemberDraft, members: MemberDraft[]) {
  if (!member.name) {
    return false;
  }
  const duplicate = members.some(
    (other) => other.key !== member.key && other.name === member.name,
  );
  return duplicate || !TEAM_NAME_PATTERN.test(member.name);
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
  const [members, setMembers] = useState<MemberDraft[]>(() =>
    template ? template.members.map(draftMember) : [draftMember()],
  );
  const [saving, setSaving] = useState(false);

  const updateMember = (key: string, patch: Partial<TeamTemplateMember>) =>
    setMembers((current) =>
      current.map((member) =>
        member.key === key ? { ...member, ...patch } : member,
      ),
    );
  const removeMember = (key: string) =>
    setMembers((current) => current.filter((member) => member.key !== key));
  const valid =
    name.trim().length > 0 &&
    members.length > 0 &&
    members.every(
      (member) => member.name && !isMemberNameInvalid(member, members),
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

  const roleOptions = [
    { value: NO_ROLE, label: t("teams.inheritRole") },
    ...roles
      .filter((role) => supportsAgentTeam(role.agentId))
      .map((role) => ({
        icon: <AgentRoleAvatar role={role} showAgent={false} />,
        value: role.id,
        label: role.name,
      })),
  ];
  const roleTriggerLabel = (roleId: string | null) => {
    const role = roles.find((item) => item.id === roleId);
    if (!role) {
      return undefined;
    }
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <AgentRoleAvatar role={role} showAgent={false} />
        <AppDropdownTriggerLabel>{role.name}</AppDropdownTriggerLabel>
      </span>
    );
  };
  const roleOf = (roleId: string | null) =>
    roles.find((role) => role.id === roleId) ?? null;

  return (
    <Dialog disablePointerDismissal onOpenChange={onOpenChange} open>
      <DialogContent size="palette">
        <DialogHeader>
          <DialogTitle>
            {template ? t("teams.editTitle") : t("teams.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <FieldGroup className="-mx-1 max-h-[min(70vh,36rem)] overflow-y-auto px-1 pb-2">
            <Field>
              <FieldLabel htmlFor="team-template-name">
                {t("teams.name")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <AgentRoleAvatarPicker
                  placeholder={<Users className="size-4" />}
                  role={{ id: avatarSeed, name, avatar }}
                  onChange={setAvatar}
                />
                <Input
                  autoFocus
                  id="team-template-name"
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("teams.namePlaceholder")}
                  value={name}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="team-template-description">
                {t("teams.teamDescription")}
              </FieldLabel>
              <Textarea
                className="max-h-32 min-h-16"
                id="team-template-description"
                maxLength={TEAM_TEMPLATE_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("teams.teamDescriptionPlaceholder")}
                value={description}
              />
            </Field>
            <Field>
              <div className="flex items-baseline justify-between gap-2">
                <FieldLabel>{t("teams.members")}</FieldLabel>
                <Text size="meta" tone="muted">
                  {t("teams.memberCount", {
                    current: members.length,
                    max: TEAM_MAX_MEMBERS,
                  })}
                </Text>
              </div>
              <FieldDescription>{t("teams.memberNameHint")}</FieldDescription>
              <ul className="flex flex-col divide-y divide-border/60">
                {members.map((member) => (
                  <li className="flex gap-3 py-3 first:pt-1" key={member.key}>
                    <TeamMemberAvatar
                      className="mt-1"
                      member={member}
                      role={roleOf(member.agentRoleId)}
                      size="md"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-invalid={isMemberNameInvalid(member, members)}
                          aria-label={t("teams.memberName")}
                          className="min-w-0 flex-1"
                          maxLength={32}
                          onChange={(event) =>
                            updateMember(member.key, {
                              name: event.target.value.toLowerCase(),
                            })
                          }
                          placeholder={t("teams.memberNamePlaceholder")}
                          value={member.name}
                        />
                        <AppSelect
                          onValueChange={(value) =>
                            updateMember(member.key, {
                              agentRoleId: value === NO_ROLE ? null : value,
                            })
                          }
                          options={roleOptions}
                          triggerAriaLabel={t("teams.role")}
                          triggerLabel={roleTriggerLabel(member.agentRoleId)}
                          value={member.agentRoleId ?? NO_ROLE}
                        />
                        <IconButton
                          aria-label={t("teams.removeMember")}
                          disabled={members.length === 1}
                          onClick={() => removeMember(member.key)}
                          size="sm"
                        >
                          <X className="size-4" />
                        </IconButton>
                      </div>
                      <Textarea
                        aria-label={t("teams.memberPrompt")}
                        className="max-h-40 min-h-14"
                        onChange={(event) =>
                          updateMember(member.key, {
                            prompt: event.target.value,
                          })
                        }
                        placeholder={t("teams.memberPromptPlaceholder")}
                        value={member.prompt}
                      />
                    </div>
                  </li>
                ))}
                {members.length < TEAM_MAX_MEMBERS ? (
                  <li className="pt-2">
                    <Button
                      className="-ms-2"
                      onClick={() =>
                        setMembers((current) => [...current, draftMember()])
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="size-3.5" />
                      {t("teams.addMember")}
                    </Button>
                  </li>
                ) : null}
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
      </DialogContent>
    </Dialog>
  );
}
