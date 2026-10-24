import { ListItem, Text } from "@expo/ui";
import type { ComponentProps } from "react";
import { useThemeColors } from "@/theme";
import { useSavedHosts } from "./hosts";

type RowModifiers = ComponentProps<typeof ListItem>["modifiers"];

export function HostRows({ rowModifiers }: { rowModifiers?: RowModifiers }) {
  const colors = useThemeColors();
  return useSavedHosts().map((host) => (
    <ListItem
      key={host.hostId}
      supportingText={
        <Text textStyle={{ color: colors.mutedForeground }}>
          {new URL(host.baseUrl).host}
        </Text>
      }
      colors={{ containerColor: colors.background }}
      modifiers={rowModifiers}
    >
      <Text>{host.name}</Text>
    </ListItem>
  ));
}
