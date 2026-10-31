import {
  buildHostPairingLink,
  type CreatedHostPairing,
  type HostAccessScope,
  type HostAddress,
} from "@cocurdex/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppCopyButton } from "@/components/app";
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
import { desktopApi } from "@/lib";
import { SettingsSelect } from "../settings-select";
import { useFormatDateTime } from "./host-access-labels";
import { PairingQrCode } from "./pairing-qr-code";
import { ScopePicker } from "./scope-picker";

const DEFAULT_SCOPES: HostAccessScope[] = ["read", "interact", "approvals"];
const TTL_OPTIONS = ["10", "30", "60"];

function CreatedPairing({
  created,
  addresses,
}: {
  created: CreatedHostPairing;
  addresses: HostAddress[];
}) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Text className="min-w-0 flex-1 font-mono" size="display" truncate>
          {created.code}
        </Text>
        <AppCopyButton value={created.code} />
      </div>
      <Text size="meta" tone="muted">
        {t("devices.pair.expires", {
          time: formatDateTime(created.pairing.expiresAt),
        })}
      </Text>
      {addresses.length === 0 ? (
        <Text size="body" tone="muted">
          {t("devices.pair.enableRemoteFirst")}
        </Text>
      ) : null}
      {addresses.map((address) => {
        const link = buildHostPairingLink(address.url, created.code);
        return (
          <div
            className="flex min-w-0 flex-col items-center gap-2"
            key={address.url}
          >
            <PairingQrCode
              label={t("devices.pair.qrLabel", { address: address.url })}
              link={link}
            />
            <div className="flex w-full min-w-0 items-center gap-2">
              <Text className="min-w-0 flex-1 font-mono" size="meta" truncate>
                {link}
              </Text>
              <AppCopyButton value={link} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PairDeviceDialog({
  addresses,
  onClose,
  onCreated,
}: {
  addresses: HostAddress[];
  onClose(): void;
  onCreated(): void;
}) {
  const { t } = useTranslation("settings");
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<HostAccessScope[]>(DEFAULT_SCOPES);
  const [ttl, setTtl] = useState(TTL_OPTIONS[0]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedHostPairing | null>(null);

  const create = async () => {
    setCreating(true);
    try {
      setCreated(
        await desktopApi.createHostPairing({
          label: label.trim(),
          scopes,
          ttlMinutes: Number(ttl),
        }),
      );
      onCreated();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("devices.pair.failed"),
      );
    } finally {
      setCreating(false);
    }
  };

  const ttlOptions = TTL_OPTIONS.map((value) => ({
    value,
    label: t("devices.pair.ttlMinutes", { count: Number(value) }),
  }));

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devices.pair.title")}</DialogTitle>
          <DialogDescription>
            {created
              ? t("devices.pair.createdDescription")
              : t("devices.pair.description")}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <CreatedPairing addresses={addresses} created={created} />
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              aria-label={t("devices.pair.label")}
              placeholder={t("devices.pair.labelPlaceholder")}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <ScopePicker scopes={scopes} onChange={setScopes} />
            <div className="flex items-center justify-between gap-4">
              <Text size="body">{t("devices.pair.ttl")}</Text>
              <SettingsSelect
                ariaLabel={t("devices.pair.ttl")}
                options={ttlOptions}
                value={ttl}
                onChange={setTtl}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {created ? (
            <Button type="button" onClick={onClose}>
              {t("devices.pair.done")}
            </Button>
          ) : (
            <Button
              disabled={creating || !label.trim() || scopes.length === 0}
              type="button"
              onClick={() => void create()}
            >
              {t("devices.pair.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
