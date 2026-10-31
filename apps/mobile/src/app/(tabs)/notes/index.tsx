import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import {
  EmptyHosts,
  useCurrentHost,
  usePairingRoutes,
  useScopeGate,
} from "@/hosts";
import { createBlankNote, NoteList } from "@/notes";
import { ListScreenHeader } from "@/ui";

export default function NotesScreen() {
  const { t } = useTranslation(["notes", "common"]);
  const { openPaste, openScan } = usePairingRoutes();
  const host = useCurrentHost();
  const router = useRouter();
  const gate = useScopeGate(host);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  if (!host) {
    return (
      <>
        <ListScreenHeader title={t("common:screens.notes")} />
        <EmptyHosts onScan={() => void openScan()} onPaste={openPaste} />
      </>
    );
  }

  return (
    <>
      <ListScreenHeader
        title={t("common:screens.notes")}
        search={{ placeholder: t("search"), onQuery: setQuery }}
        actions={[
          {
            key: "new",
            icon: { ios: "square.and.pencil", android: "edit_square" },
            label: t("create.open"),
            disabled: creating,
            onPress: gate("interact", () => {
              setCreating(true);
              createBlankNote(host.hostId)
                .then((note) =>
                  router.push({
                    pathname: "/note/[hostId]/[noteId]",
                    params: {
                      hostId: host.hostId,
                      noteId: note.id,
                      created: "1",
                    },
                  }),
                )
                .catch(() => Alert.alert(t("create.failed")))
                .finally(() => setCreating(false));
            }),
          },
        ]}
      />
      <NoteList host={host} query={query} />
    </>
  );
}
