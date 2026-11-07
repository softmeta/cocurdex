import { useTabTrigger } from "expo-router/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ListScreenHeader,
  type ListScreenHeaderProps,
  useAnchoredMenu,
} from "@/ui";
import { FloatingTab } from "./floating-tab-bar";

export const SESSION_MODES = [
  {
    key: "assistant",
    name: "(assistant)",
    href: "/",
    icon: { ios: "sparkles", android: "auto_awesome" },
    label: "tabs.assistant",
  },
  {
    key: "work",
    name: "sessions",
    href: "/sessions",
    icon: { ios: "folder", android: "folder" },
    label: "tabs.work",
  },
  {
    key: "chat",
    name: "chat",
    href: "/chat",
    icon: { ios: "bubble.left", android: "chat_bubble" },
    label: "tabs.chat",
  },
] as const;

export function SessionModeHeader(
  props: Omit<ListScreenHeaderProps, "titleAction">,
) {
  const { t } = useTranslation();
  const { getTrigger, switchTab } = useTabTrigger({ name: "(assistant)" });
  const menu = useAnchoredMenu("session-mode-menu");
  return (
    <>
      <ListScreenHeader
        {...props}
        titleAction={{
          label: t("tabs.switchMode", { mode: props.title }),
          testID: "session-mode-switch",
          onPress: (anchor) =>
            menu.open(anchor, {
              items: SESSION_MODES.map((option) => ({
                key: option.key,
                label: t(option.label),
                icon: option.icon,
                selected: getTrigger(option.name)?.isFocused,
                testID: `session-mode-${option.key}`,
                onPress: () => switchTab(option.name, {}),
              })),
            }),
        }}
      />
      {menu.menu}
    </>
  );
}

export function SessionsTab() {
  const { t } = useTranslation();
  const { getTrigger, switchTab } = useTabTrigger({ name: "(assistant)" });
  const focused = SESSION_MODES.find(
    (mode) => getTrigger(mode.name)?.isFocused,
  );
  const [lastMode, setLastMode] = useState<(typeof SESSION_MODES)[number]>(
    SESSION_MODES[0],
  );
  if (focused && focused !== lastMode) setLastMode(focused);
  return (
    <FloatingTab
      icon={{ ios: "bubble.left.and.bubble.right", android: "forum" }}
      label={t("screens.sessions")}
      testID="sessions-tab"
      isFocused={Boolean(focused)}
      onPress={() => switchTab(lastMode.name, {})}
    />
  );
}
