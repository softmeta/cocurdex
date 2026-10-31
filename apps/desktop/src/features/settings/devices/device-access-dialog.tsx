import type { HostAccessScope, PairedDeviceRecord } from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { desktopApi } from "@/lib";
import { ScopePicker } from "./scope-picker";

function sameScopes(left: HostAccessScope[], right: HostAccessScope[]) {
  return (
    left.length === right.length && left.every((scope) => right.includes(scope))
  );
}

export function DeviceAccessDialog({
  device,
  onClose,
  onSaved,
}: {
  device: PairedDeviceRecord;
  onClose(): void;
  onSaved(): void;
}) {
  const { t } = useTranslation("settings");
  const [scopes, setScopes] = useState(device.scopes);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await desktopApi.updateHostDeviceScopes(device.id, scopes);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("devices.access.failed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("devices.access.title", {
              name: device.label || t("devices.list.unnamed"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("devices.access.description")}
          </DialogDescription>
        </DialogHeader>
        <ScopePicker scopes={scopes} onChange={setScopes} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("devices.access.cancel")}
          </Button>
          <Button
            disabled={
              saving || scopes.length === 0 || sameScopes(scopes, device.scopes)
            }
            type="button"
            onClick={() => void save()}
          >
            {t("devices.access.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
