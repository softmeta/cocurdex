import type { AgentId } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EmptyHosts,
  useCurrentHost,
  usePairingRoutes,
  useScopeGate,
} from "@/hosts";
import { SessionList, sessionsStore } from "@/sessions";
import { SessionModeHeader } from "@/tabs";

const AGENT_LABELS = new Map<AgentId, string>();

export default function ChatsScreen() {
  const { t } = useTranslation(["common", "sessions"]);
  const { openPaste, openScan } = usePairingRoutes();
  const router = useRouter();
  const host = useCurrentHost();
  const gate = useScopeGate(host);
  const [query, setQuery] = useState("");
  const title = t("tabs.chat");
  if (!host) {
    return (
      <>
        <SessionModeHeader title={title} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
      </>
    );
  }
  return (
    <>
      <SessionModeHeader
        title={title}
        search={{ placeholder: t("sessions:chat.search"), onQuery: setQuery }}
        actions={[
          {
            key: "new",
            icon: { ios: "square.and.pencil", android: "edit_square" },
            label: t("sessions:chat.new"),
            onPress: gate("execute", () =>
              router.push({
                pathname: "/new-chat/[hostId]",
                params: { hostId: host.hostId },
              }),
            ),
          },
        ]}
      />
      <SessionList
        key={host.hostId}
        host={host}
        mode="chat"
        query={query}
        agentLabels={AGENT_LABELS}
        onReload={() => void sessionsStore(host.hostId).reload()}
      />
    </>
  );
}
