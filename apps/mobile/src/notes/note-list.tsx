import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SectionList, StyleSheet } from "react-native";
import { useHostSessions } from "@/sessions";
import {
  ListNotice,
  ListSectionHeader,
  PendingIndicator,
  usePullToRefresh,
  useScrollIndicatorWhileScrolling,
  useTabBarInset,
} from "@/ui";
import { useNotes } from "./note-queries";
import { NoteRowView } from "./note-row";
import { type NoteRow, noteSections } from "./note-sections";

export function NoteList({ host, query }: { host: SavedHost; query: string }) {
  const scrollIndicator = useScrollIndicatorWhileScrolling();
  const tabBarInset = useTabBarInset();
  const { t } = useTranslation("notes");
  const router = useRouter();
  const notes = useNotes(host.hostId);
  const pull = usePullToRefresh(() => notes.mutate());
  const { workspaces } = useHostSessions(host.hostId);
  const sections = useMemo(
    () =>
      noteSections(notes.data ?? [], workspaces, query).map((section) => ({
        title: section.workspace?.name ?? t("noWorkspace"),
        key: section.workspace?.id ?? "",
        data: section.rows,
      })),
    [notes.data, workspaces, query, t],
  );

  if (!notes.data) {
    if (!notes.error) return <PendingIndicator />;
    return (
      <ListNotice
        icon={{ ios: "wifi.slash", android: "cloud_off" }}
        title={t("unavailable.title", { host: host.name })}
        action={{
          label: t("unavailable.retry"),
          onPress: () => void notes.mutate(),
        }}
      />
    );
  }

  const searching = query.trim() !== "";
  return (
    <SectionList<NoteRow>
      {...scrollIndicator}
      contentContainerStyle={{ paddingBottom: tabBarInset }}
      style={styles.fill}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      sections={sections}
      keyExtractor={(row) => row.note.id}
      stickySectionHeadersEnabled={false}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      ListEmptyComponent={
        searching ? (
          <ListNotice
            icon={{ ios: "magnifyingglass", android: "search" }}
            title={t("noResults", { query: query.trim() })}
          />
        ) : (
          <ListNotice
            icon={{ ios: "doc.text", android: "description" }}
            title={t("empty.title")}
            description={t("empty.description", { host: host.name })}
          />
        )
      }
      renderSectionHeader={({ section }) => (
        <ListSectionHeader title={section.title} />
      )}
      renderItem={({ item }) => (
        <NoteRowView
          row={item}
          onPress={() =>
            router.push({
              pathname: "/note/[hostId]/[noteId]",
              params: { hostId: host.hostId, noteId: item.note.id },
            })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
