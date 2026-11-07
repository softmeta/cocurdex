import { useTranslation } from "react-i18next";
import { AssistantHome } from "@/assistant";
import { EmptyHosts, useCurrentHost, usePairingRoutes } from "@/hosts";
import { LaunchReady } from "@/launch";
import { ListScreenHeader } from "@/ui";

export default function AssistantScreen() {
  const { t } = useTranslation();
  const { openPaste, openScan } = usePairingRoutes();
  const host = useCurrentHost();
  return (
    <>
      <ListScreenHeader title={t("screens.assistant")} />
      {host ? (
        <AssistantHome key={host.hostId} host={host} />
      ) : (
        <>
          <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
          <LaunchReady />
        </>
      )}
    </>
  );
}
