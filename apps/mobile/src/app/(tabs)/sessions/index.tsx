import { type AgentId, countActiveSessionFilters } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgents } from "@/agents";
import {
  EmptyHosts,
  useCurrentHost,
  usePairingRoutes,
  useScopeGate,
} from "@/hosts";
import { beginNewSession } from "@/new-session";
import { SessionList, sessionsStore, useSessionListUi } from "@/sessions";
import { ListScreenHeader } from "@/ui";

export default function SessionsScreen() {
  const { t } = useTranslation(["sessions", "common"]);
  const { openPaste, openScan } = usePairingRoutes();
  const router = useRouter();
  const host = useCurrentHost();
  const [query, setQuery] = useState("");
  if (!host) {
    return (
      <>
        <ListScreenHeader title={t("common:screens.sessions")} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
      </>
    );
  }
  return (
    <HostSessionsScreen
      key={host.hostId}
      host={host}
      query={query}
      onQuery={setQuery}
      onNewSession={() => {
        beginNewSession(host.hostId);
        router.push("/new-session");
      }}
    />
  );
}

function HostSessionsScreen({
  host,
  query,
  onQuery,
  onNewSession,
}: {
  host: NonNullable<ReturnType<typeof useCurrentHost>>;
  query: string;
  onQuery(query: string): void;
  onNewSession(): void;
}) {
  const { t } = useTranslation(["sessions", "common"]);
  const router = useRouter();
  const { view } = useSessionListUi();
  const filtered = countActiveSessionFilters(view) > 0;
  const descriptors = useAgents(host.hostId).data;
  const agentLabels = new Map<AgentId, string>(
    descriptors?.map((agent) => [agent.id, agent.label]),
  );
  const gate = useScopeGate(host);

  return (
    <>
      <ListScreenHeader
        title={t("common:screens.sessions")}
        search={{ placeholder: t("search"), onQuery }}
        actions={[
          {
            key: "filter",
            icon: {
              ios: filtered
                ? "line.3.horizontal.decrease.circle.fill"
                : "line.3.horizontal.decrease.circle",
              android: "filter_list",
            },
            label: t("list.menu"),
            badge: filtered,
            onPress: () => router.push("/list-options"),
          },
          {
            key: "new",
            icon: { ios: "square.and.pencil", android: "edit_square" },
            label: t("newSession.open"),
            onPress: gate("execute", onNewSession),
          },
        ]}
      />
      <SessionList
        host={host}
        query={query}
        agentLabels={agentLabels}
        onReload={() => void sessionsStore(host.hostId).reload()}
      />
    </>
  );
}
