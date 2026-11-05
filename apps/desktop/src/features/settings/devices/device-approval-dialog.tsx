import type { HostDeviceApprovalFailure, PairedDevice } from "@cocurdex/shared";
import { type FormEvent, useState } from "react";
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
  Input,
  Label,
  Text,
} from "@/components/ui";
import { desktopApi, useDialogExit } from "@/lib";
import { useScopeLabels } from "./host-access-labels";

const SAFETY_CODE_LENGTH = 6;

function readSafetyCode(value: string) {
  return value.replace(/\D/g, "").slice(0, SAFETY_CODE_LENGTH);
}

export function DeviceApprovalDialog({
  device,
  onClose,
  onSettled,
}: {
  device: PairedDevice;
  onClose(): void;
  onSettled(): void;
}) {
  const [decided, setDecided] = useState(false);
  const exit = useDialogExit(() => {
    if (decided) onSettled();
    onClose();
  });
  const { t, i18n } = useTranslation("settings");
  const scopeLabels = useScopeLabels();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<HostDeviceApprovalFailure | null>(
    null,
  );
  const name = device.label || t("devices.list.unnamed");
  const failureMessages: Record<HostDeviceApprovalFailure, string> = {
    notPending: t("devices.approval.failure.notPending"),
    codeMismatch: t("devices.approval.failure.codeMismatch"),
    tooManyAttempts: t("devices.approval.failure.tooManyAttempts"),
  };

  const finish = () => {
    setDecided(true);
    exit.close();
  };

  const allow = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== SAFETY_CODE_LENGTH) return;
    setBusy(true);
    try {
      const approval = await desktopApi.approveHostDevice(device.id, code);
      if (approval.ok) {
        finish();
        return;
      }
      setFailure(approval.reason);
      setCode("");
      if (approval.reason !== "codeMismatch") onSettled();
    } catch {
      toast.error(t("devices.approval.failed"));
    } finally {
      setBusy(false);
    }
  };

  const deny = async () => {
    setBusy(true);
    try {
      await desktopApi.revokeHostDevice(device.id);
      finish();
    } catch {
      toast.error(t("devices.approval.failed"));
      setBusy(false);
    }
  };

  const settled = failure === "notPending" || failure === "tooManyAttempts";

  return (
    <Dialog
      disablePointerDismissal
      open={exit.open}
      onOpenChangeComplete={exit.onOpenChangeComplete}
      onOpenChange={(open) => !open && exit.close()}
    >
      <DialogContent size="compact">
        <form className="contents" onSubmit={(event) => void allow(event)}>
          <DialogHeader>
            <DialogTitle>{t("devices.approval.title", { name })}</DialogTitle>
            <DialogDescription>
              {t("devices.approval.description", {
                scopes: new Intl.ListFormat(i18n.language, {
                  type: "conjunction",
                }).format(
                  device.scopes.map((scope) => scopeLabels[scope].title),
                ),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="device-approval-code">
              {t("devices.approval.codeLabel")}
            </Label>
            <Input
              aria-describedby={failure ? "device-approval-error" : undefined}
              aria-invalid={failure === "codeMismatch"}
              autoComplete="one-time-code"
              autoFocus
              className="font-mono tabular-nums"
              disabled={busy || settled}
              id="device-approval-code"
              inputMode="numeric"
              maxLength={SAFETY_CODE_LENGTH}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(readSafetyCode(event.target.value))}
            />
            {failure ? (
              <Text id="device-approval-error" size="meta" tone="destructive">
                {failureMessages[failure]}
              </Text>
            ) : (
              <Text size="meta" tone="muted">
                {t("devices.approval.codeHint")}
              </Text>
            )}
          </div>
          <DialogFooter>
            {settled ? (
              <Button type="button" onClick={exit.close}>
                {t("devices.approval.close")}
              </Button>
            ) : (
              <>
                <Button
                  disabled={busy}
                  type="button"
                  variant="ghost"
                  onClick={() => void deny()}
                >
                  {t("devices.approval.deny")}
                </Button>
                <Button
                  disabled={busy || code.length !== SAFETY_CODE_LENGTH}
                  type="submit"
                >
                  {t("devices.approval.allow")}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
