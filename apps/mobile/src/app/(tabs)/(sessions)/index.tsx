import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyHosts, HostSwitcher, useCurrentHost } from "@/hosts";
import { SessionList, sessionsStore } from "@/sessions";

export default function SessionsScreen() {
  const { t } = useTranslation("sessions");
  const router = useRouter();
  const host = useCurrentHost();
  const [query, setQuery] = useState("");
  const openPairing = () => router.push("/pair");

  if (!host) return <EmptyHosts onPair={openPairing} />;

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: t("search"),
            hideWhenScrolling: false,
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(""),
          },
        }}
      />
      <HostSwitcher current={host} onPair={openPairing} />
      <SessionList
        host={host}
        query={query}
        onReload={() => void sessionsStore(host.hostId).reload()}
      />
    </>
  );
}
