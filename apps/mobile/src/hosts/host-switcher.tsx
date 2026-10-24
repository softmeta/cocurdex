import type { SavedHost } from "@cocurdex/client-runtime";
import ComputerIcon from "@expo/material-symbols/computer.xml";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { selectHost, useSavedHosts } from "./hosts";

export function HostSwitcher({
  current,
  onPair,
}: {
  current: SavedHost;
  onPair(): void;
}) {
  const { t } = useTranslation("hosts");
  const saved = useSavedHosts();
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Menu
        title={current.name}
        icon={Platform.OS === "ios" ? "laptopcomputer" : ComputerIcon}
        accessibilityLabel={t("switcher.label", { host: current.name })}
      >
        {saved.map((host) => (
          <Stack.Toolbar.MenuAction
            key={host.hostId}
            isOn={host.hostId === current.hostId}
            onPress={() => selectHost(host.hostId)}
          >
            {host.name}
          </Stack.Toolbar.MenuAction>
        ))}
        <Stack.Toolbar.MenuAction
          icon={Platform.OS === "ios" ? "plus" : undefined}
          onPress={onPair}
        >
          {t("empty.pair")}
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
