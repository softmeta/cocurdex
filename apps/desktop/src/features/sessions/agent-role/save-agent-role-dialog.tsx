import {
  AGENT_ROLE_DESCRIPTION_MAX_LENGTH,
  AGENT_ROLE_NAME_MAX_LENGTH,
  type AgentId,
  type AgentRoleAvatar,
} from "@cocurdex/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentIconLabel } from "../agent-icon";
import { AgentRoleAvatarPicker } from "./agent-role-avatar-picker";

export function SaveAgentRoleDialog({
  open,
  onOpenChange,
  onSave,
  agentId,
  summary,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(role: {
    id: string;
    name: string;
    description: string | null;
    avatar: AgentRoleAvatar | null;
  }): Promise<void> | void;
  agentId: AgentId;
  summary?: string;
}) {
  const { t } = useTranslation("sessions");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [avatar, setAvatar] = useState<AgentRoleAvatar | null>(null);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setDescription("");
      setAvatar(null);
      setDraftId(crypto.randomUUID());
      setSaving(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: draftId,
        name: trimmed,
        description: description.trim() || null,
        avatar,
      });
      handleOpenChange(false);
    } catch {
      setSaving(false);
      toast.error(t("agentRole.saveFailed"));
    }
  };

  return (
    <Dialog disablePointerDismissal open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="compact">
        <form className="contents" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("agentRole.saveTitle")}</DialogTitle>
            <DialogDescription>
              {summary ? (
                <AgentIconLabel agentId={agentId}>{summary}</AgentIconLabel>
              ) : (
                t("agentRole.saveDescription")
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="pb-2">
            <Field>
              <FieldLabel htmlFor="save-agent-role-name">
                {t("agentRole.name")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <AgentRoleAvatarPicker
                  role={{ id: draftId, name, agentId, avatar }}
                  onChange={setAvatar}
                />
                <Input
                  autoFocus
                  id="save-agent-role-name"
                  maxLength={AGENT_ROLE_NAME_MAX_LENGTH}
                  placeholder={t("agentRole.namePlaceholder")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="save-agent-role-description">
                {t("agentRole.description")}
              </FieldLabel>
              <Textarea
                id="save-agent-role-description"
                className="max-h-40 min-h-20"
                maxLength={AGENT_ROLE_DESCRIPTION_MAX_LENGTH}
                placeholder={t("agentRole.descriptionPlaceholder")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="py-3">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  {t("agentRole.cancel")}
                </Button>
              }
            />
            <Button disabled={!name.trim() || saving} type="submit">
              {t("agentRole.saveAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
