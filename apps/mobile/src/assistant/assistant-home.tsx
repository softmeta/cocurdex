import type { SavedHost } from "@cocurdex/client-runtime";
import type { InboxItem } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet } from "react-native";
import {
  ListNotice,
  ListSectionHeader,
  PendingIndicator,
  usePullToRefresh,
  useScrollIndicatorWhileScrolling,
  useTabBarInset,
} from "@/ui";
import {
  greetPersonalAgent,
  readInboxItem,
  revalidateAssistant,
  useBrief,
  useInbox,
  usePersonalAgents,
} from "./assistant-queries";
import { AgentRow, BriefResultRow, InboxRow } from "./assistant-rows";
import {
  type AssistantRow,
  type AssistantSection,
  assistantSections,
} from "./assistant-sections";
import { useAssistantRevalidation } from "./use-assistant-revalidation";

function useSectionTitles(): Record<AssistantSection["kind"], string> {
  const { t } = useTranslation("assistant");
  return {
    brief: t("brief.title"),
    inbox: t("inbox.title"),
    agents: t("agents.title"),
  };
}

export function AssistantHome({ host }: { host: SavedHost }) {
  const { t } = useTranslation("assistant");
  const router = useRouter();
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const tabBarInset = useTabBarInset();
  const titles = useSectionTitles();
  const agents = usePersonalAgents(host.hostId);
  const inbox = useInbox(host.hostId);
  const brief = useBrief(host.hostId);
  const pull = usePullToRefresh(() => revalidateAssistant(host.hostId));
  useAssistantRevalidation(host.hostId);

  const openSession = (sessionId: string) =>
    router.push({
      pathname: "/session/[hostId]/[sessionId]",
      params: { hostId: host.hostId, sessionId },
    });
  const openItem = (item: InboxItem) => {
    if (item.sessionId) openSession(item.sessionId);
    void readInboxItem(host.hostId, item.id).catch(() => undefined);
  };

  if (!agents.data) {
    if (!agents.error) return <PendingIndicator />;
    return (
      <ListNotice
        icon={{ ios: "wifi.slash", android: "cloud_off" }}
        title={t("unavailable.title", { host: host.name })}
        action={{
          label: t("unavailable.retry"),
          onPress: () => void revalidateAssistant(host.hostId),
        }}
      />
    );
  }

  const sections = assistantSections({
    brief: brief.data ?? null,
    inbox: inbox.data ?? [],
    agents: agents.data,
  });

  const renderItem = ({ item }: { item: AssistantRow }) => {
    if (item.kind === "result") {
      return <BriefResultRow result={item.result} onOpen={openSession} />;
    }
    if (item.kind === "inbox") {
      return <InboxRow item={item.item} onOpen={openItem} />;
    }
    const { role } = item.agent;
    const subtitle = role.description ?? "";
    return (
      <AgentRow
        agent={item.agent}
        subtitle={subtitle}
        onOpen={(agent) => {
          greetPersonalAgent(host, agent.id);
          openSession(agent.homeSessionId);
        }}
      />
    );
  };

  return (
    <SectionList<AssistantRow, AssistantSection>
      {...scrollIndicator}
      contentContainerStyle={{ paddingBottom: tabBarInset }}
      style={styles.fill}
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(row) => row.key}
      stickySectionHeadersEnabled={false}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      ListEmptyComponent={
        <ListNotice
          icon={{ ios: "sparkles", android: "auto_awesome" }}
          title={t("empty.title")}
          description={t("empty.description", { host: host.name })}
        />
      }
      renderSectionHeader={({ section }) => (
        <ListSectionHeader
          title={titles[section.kind]}
          count={section.kind === "inbox" ? section.data.length : undefined}
          testID={`assistant-section-${section.kind}`}
        />
      )}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
