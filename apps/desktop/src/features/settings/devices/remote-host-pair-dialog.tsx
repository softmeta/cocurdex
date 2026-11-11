import type { RemoteHostPairing } from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from "@/components/ui";
import { requestDaemon, useDialogExit } from "@/lib";
import { useScopeLabels } from "./host-access-labels";

function PairingResult({ pairing }: { pairing: RemoteHostPairing }) {
  const { t } = useTranslation("settings");
  const scopeLabels = useScopeLabels();
  const { host, missingScopes } = pairing;
  return (
    <div className="flex flex-col gap-3">
      <Text
        aria-label={t("devices.remotes.safetyCode")}
        as="p"
        className="font-mono tabular-nums tracking-widest"
        size="display"
        weight="medium"
      >
        {host.safetyCode}
      </Text>
      {host.status === "pending" ? (
        <Text size="body" tone="muted">
          {t("devices.remotes.approveThere", { name: host.name })}
        </Text>
      ) : null}
      {missingScopes.length > 0 ? (
        <Text size="body" tone="muted">
          {t("devices.remotes.missingScopes", {
            name: host.name,
            scopes: missingScopes
              .map((scope) => scopeLabels[scope].title)
              .join(", "),
          })}
        </Text>
      ) : null}
    </div>
  );
}

export function RemoteHostPairDialog({
  onClose,
  onPaired,
}: {
  onClose(): void;
  onPaired(): void;
}) {
  const exit = useDialogExit(onClose);
  const { t } = useTranslation("settings");
  const [link, setLink] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState<RemoteHostPairing | null>(null);

  const pair = async () => {
    setPairing(true);
    setError(null);
    try {
      setPaired(
        await requestDaemon("host.remotes.pair", { link: link.trim() }),
      );
      onPaired();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("devices.remotes.pairFailed"),
      );
    } finally {
      setPairing(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => !open && exit.close()}
      onOpenChangeComplete={exit.onOpenChangeComplete}
      open={exit.open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devices.remotes.pairTitle")}</DialogTitle>
          <DialogDescription>
            {paired
              ? t("devices.remotes.pairedDescription", {
                  name: paired.host.name,
                })
              : t("devices.remotes.pairDescription")}
          </DialogDescription>
        </DialogHeader>
        {paired ? (
          <PairingResult pairing={paired} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Input
              aria-label={t("devices.remotes.link")}
              autoFocus
              placeholder={t("devices.remotes.linkPlaceholder")}
              value={link}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && link.trim() && !pairing) {
                  void pair();
                }
              }}
            />
            {error ? (
              <Text size="meta" tone="destructive">
                {error}
              </Text>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {paired ? (
            <Button type="button" onClick={exit.close}>
              {t("devices.pair.done")}
            </Button>
          ) : (
            <Button
              disabled={pairing || !link.trim()}
              type="button"
              onClick={() => void pair()}
            >
              {t("devices.remotes.pair")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
