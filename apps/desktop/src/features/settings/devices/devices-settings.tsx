import { hostPairingAddresses } from "@cocurdex/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import {
  AccessLogGroup,
  PairedDevicesGroup,
  PendingPairingsGroup,
} from "./device-lists";
import { LocalWebGroup } from "./local-web-group";
import { PairDeviceDialog } from "./pair-device-dialog";
import { RelayGroup } from "./relay-group";
import { RemoteAccessGroup } from "./remote-access-group";
import { useHostAccess } from "./use-host-access";

export function DevicesSettingsPanel() {
  const { t } = useTranslation("settings");
  const { snapshot, error, refresh } = useHostAccess();
  const [pairing, setPairing] = useState(false);

  if (!snapshot) {
    return error ? (
      <Text size="body" tone="destructive">
        {error}
      </Text>
    ) : null;
  }

  const reload = () => void refresh();
  const remoteAllowed = snapshot.remote.allowed;

  return (
    <div className="settings-panel-enter flex flex-col gap-8">
      <LocalWebGroup />
      {remoteAllowed ? (
        <RemoteAccessGroup
          key={snapshot.remote.settings.port}
          status={snapshot.remote}
          onChanged={reload}
        />
      ) : null}
      {remoteAllowed ? (
        <RelayGroup
          key={snapshot.remote.relay.url ?? ""}
          status={snapshot.remote}
          onChanged={reload}
        />
      ) : null}
      <PairedDevicesGroup
        action={
          remoteAllowed ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setPairing(true)}
            >
              <Plus className="size-3.5" />
              {t("devices.pair.open")}
            </Button>
          ) : null
        }
        devices={snapshot.devices}
        onChanged={reload}
      />
      {remoteAllowed ? (
        <PendingPairingsGroup pairings={snapshot.pairings} onChanged={reload} />
      ) : null}
      <AccessLogGroup entries={snapshot.audit} />
      {remoteAllowed && pairing ? (
        <PairDeviceDialog
          addresses={hostPairingAddresses(snapshot.remote)}
          onClose={() => setPairing(false)}
          onCreated={reload}
        />
      ) : null}
    </div>
  );
}
