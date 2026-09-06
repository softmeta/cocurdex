import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui";
import {
  Dialog,
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
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(name: string): Promise<void> | void;
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
        <DialogHeader>
          <DialogTitle>{t("agentRole.saveTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentRole.saveDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Input
            autoFocus
            maxLength={80}
            placeholder={t("agentRole.namePlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t("agentRole.cancel")}
            </Button>
            <Button disabled={!name.trim() || saving} type="submit">
              {t("agentRole.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
