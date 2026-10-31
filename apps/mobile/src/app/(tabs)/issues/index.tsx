import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EmptyHosts,
  useCurrentHost,
  usePairingRoutes,
  useScopeGate,
} from "@/hosts";
import {
  IssueFilterChips,
  IssueList,
  singleWorkspaceFilter,
  useIssueFilters,
} from "@/issues";
import { ListScreenHeader } from "@/ui";

export default function IssuesScreen() {
  const { t } = useTranslation();
  const { openPaste, openScan } = usePairingRoutes();
  const host = useCurrentHost();
  if (!host) {
    return (
      <>
        <ListScreenHeader title={t("screens.issues")} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
      </>
    );
  }
  return <HostIssues host={host} />;
}

function HostIssues({ host }: { host: SavedHost }) {
  const { t } = useTranslation(["issues", "common"]);
  const router = useRouter();
  const gate = useScopeGate(host);
  const [query, setQuery] = useState("");
  const filters = useIssueFilters(host.hostId);
  const workspaceId = singleWorkspaceFilter(filters);
  const filtered = Object.values(filters).some((values) => values.length > 0);

  return (
    <>
      <ListScreenHeader
        title={t("common:screens.issues")}
        search={{ placeholder: t("search"), onQuery: setQuery }}
        actions={[
          {
            key: "filter",
            icon: {
              ios: filtered
                ? "line.3.horizontal.decrease.circle.fill"
                : "line.3.horizontal.decrease.circle",
              android: "filter_list",
            },
            label: t("filter.title"),
            badge: filtered,
            onPress: () => router.push("/issue-filters"),
          },
          {
            key: "new",
            icon: { ios: "square.and.pencil", android: "edit_square" },
            label: t("create.open"),
            onPress: gate("interact", () =>
              router.push({
                pathname: "/new-issue/[hostId]",
                params: workspaceId
                  ? { hostId: host.hostId, workspaceId }
                  : { hostId: host.hostId },
              }),
            ),
          },
        ]}
      />
      <IssueList
        host={host}
        query={query}
        header={<IssueFilterChips host={host} />}
      />
    </>
  );
}
