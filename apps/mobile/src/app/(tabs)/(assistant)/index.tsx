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
import { ListScreenHeader } from "@/ui";

export default function AssistantScreen() {
  const { t } = useTranslation(["common", "assistant"]);
  const { openPaste, openScan } = usePairingRoutes();
  const host = useCurrentHost();
  const router = useRouter();
  const gate = useScopeGate(host);
  if (!host) {
    return (
      <>
        <ListScreenHeader title={t("common:screens.assistant")} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
        <LaunchReady />
      </>
    );
  }
  return (
    <>
      <ListScreenHeader
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
