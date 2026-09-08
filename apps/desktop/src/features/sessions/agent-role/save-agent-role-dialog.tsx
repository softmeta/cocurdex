import { AGENT_ROLE_NAME_MAX_LENGTH } from "@cocurdex/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Field, FieldGroup, FieldLabel, Input } from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SaveAgentRoleDialog({
  open,
  onOpenChange,
  onSave,
  summary,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(name: string): Promise<void> | void;
  summary?: string;
}) {
  const { t } = useTranslation("sessions");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
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
      await onSave(trimmed);
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
              {summary || t("agentRole.saveDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="pb-2">
            <Field>
              <FieldLabel htmlFor="save-agent-role-name">
                {t("agentRole.name")}
              </FieldLabel>
              <Input
                autoFocus
                id="save-agent-role-name"
                maxLength={AGENT_ROLE_NAME_MAX_LENGTH}
                placeholder={t("agentRole.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
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
