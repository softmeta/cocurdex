import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AssistantHome } from "@/assistant";
import {
  EmptyHosts,
  useCurrentHost,
  usePairingRoutes,
  useScopeGate,
} from "@/hosts";
import { LaunchReady } from "@/launch";
import { SessionModeHeader } from "@/tabs";

export default function AssistantScreen() {
  const { t } = useTranslation(["common", "assistant"]);
  const { openPaste, openScan } = usePairingRoutes();
  const host = useCurrentHost();
  const router = useRouter();
  const gate = useScopeGate(host);
  if (!host) {
    return (
      <>
        <SessionModeHeader title={t("common:screens.assistant")} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
        <LaunchReady />
      </>
    );
  }
  return (
    <>
      <SessionModeHeader
        title={t("common:screens.assistant")}
        actions={[
          {
            key: "new",
            icon: { ios: "square.and.pencil", android: "edit_square" },
            label: t("assistant:form.newTitle"),
            onPress: gate("interact", () =>
              router.push({
                pathname: "/assistant-form/[hostId]",
                params: { hostId: host.hostId },
              }),
            ),
          },
        ]}
      />
      <AssistantHome key={host.hostId} host={host} />
    </>
  );
}
