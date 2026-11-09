import type { SavedHost } from "@cocurdex/client-runtime";
import type { PersonalAgentRecord } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet } from "react-native";
import { LaunchReady } from "@/launch";
import { sessionRowStatus, useHostSessions } from "@/sessions";
import {
  ListNotice,
  ListSectionHeader,
  PendingIndicator,
  usePullToRefresh,
  useScrollIndicatorWhileScrolling,
  useTabBarInset,
} from "@/ui";
import { useAgentActions } from "./agent-actions-menu";
import {
  greetPersonalAgent,
  revalidateAssistant,
  useBrief,
  useLatestReply,
  usePersonalAgents,
} from "./assistant-queries";
import { AgentRow, BriefResultRow } from "./assistant-rows";
import {
  type AssistantRow,
  type AssistantSection,
  assistantSections,
} from "./assistant-sections";
import { useAssistantRevalidation } from "./use-assistant-revalidation";

function useSectionTitles(): Record<AssistantSection["kind"], string | null> {
  const { t } = useTranslation("assistant");
  return {
    brief: t("brief.title"),
    agents: null,
  };
}

function AgentRoster({
  host,
  agent,
  onOpen,
  onLongPress,
}: {
  host: SavedHost;
  agent: PersonalAgentRecord;
  onOpen(agent: PersonalAgentRecord): void;
  onLongPress: Parameters<typeof AgentRow>[0]["onLongPress"];
}) {
  const { t } = useTranslation("assistant");
  const snapshot = useHostSessions(host.hostId);
  const session = snapshot.sessions.find(
    (item) => item.id === agent.homeSessionId,
  );
  const attention = snapshot.attention.find(
    (item) => item.sessionId === agent.homeSessionId,
  );
  const status = attention ? sessionRowStatus(attention.primaryState) : "none";
  const stamp = session?.lastMessageAt ?? null;
  const reply = useLatestReply(host.hostId, agent.homeSessionId, stamp).data;
  const preview = reply ? previewLine(reply.content) : "";
  const subtitle =
    status === "running"
      ? t("agents.working")
      : preview || agent.role.description || "\u00a0";
  return (
    <AgentRow
      agent={agent}
      activityAt={stamp}
      status={status}
      subtitle={subtitle}
      onOpen={onOpen}
      onLongPress={onLongPress}
    />
  );
}

function previewLine(content: string) {
  return content
    .replace(/[`*_>#~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function AssistantHome({ host }: { host: SavedHost }) {
  const { t } = useTranslation("assistant");
  const router = useRouter();
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const tabBarInset = useTabBarInset();
  const titles = useSectionTitles();
  const agents = usePersonalAgents(host.hostId);
  const brief = useBrief(host.hostId);
  const pull = usePullToRefresh(() => revalidateAssistant(host.hostId));
  useAssistantRevalidation(host.hostId);

  const openSession = (sessionId: string) =>
    router.push({
      pathname: "/session/[hostId]/[sessionId]",
      params: { hostId: host.hostId, sessionId },
    });
  const agentActions = useAgentActions(host, openSession);

  if (!agents.data) {
    if (!agents.error) return <PendingIndicator />;
    return (
      <>
        <LaunchReady />
        <ListNotice
          icon={{ ios: "wifi.slash", android: "cloud_off" }}
          title={t("unavailable.title", { host: host.name })}
          action={{
            label: t("unavailable.retry"),
            onPress: () => void revalidateAssistant(host.hostId),
          }}
        />
      </>
    );
  }

  const sections = assistantSections({
    brief: brief.data ?? null,
    agents: agents.data,
  });

  const renderItem = ({ item }: { item: AssistantRow }) => {
    if (item.kind === "result") {
      return <BriefResultRow result={item.result} onOpen={openSession} />;
    }
    return (
      <AgentRoster
        host={host}
        agent={item.agent}
        onOpen={(agent) => {
          greetPersonalAgent(host, agent.id);
          openSession(agent.homeSessionId);
        }}
        onLongPress={agentActions.open}
      />
    );
  };

  const settled = brief.data !== undefined || brief.error !== undefined;

  return (
    <>
      {settled ? <LaunchReady /> : null}
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
        renderSectionHeader={({ section }) => {
          const title = titles[section.kind];
          if (!title) return null;
          return (
            <ListSectionHeader
              title={title}
              testID={`assistant-section-${section.kind}`}
            />
          );
        }}
        renderItem={renderItem}
      />
      {agentActions.menu}
      {agentActions.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
