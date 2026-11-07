import { useTabTrigger } from "expo-router/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HostInstance } from "react-native";
import { measureAnchor, useAnchoredMenu } from "@/ui";
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

export function ModeTab() {
  const { t } = useTranslation();
  const { getTrigger, switchTab } = useTabTrigger({ name: "(assistant)" });
  const menu = useAnchoredMenu("session-mode-menu");
  const button = useRef<HostInstance>(null);
  const focused = SESSION_MODES.find(
    (mode) => getTrigger(mode.name)?.isFocused,
  );
  const [lastMode, setLastMode] = useState<(typeof SESSION_MODES)[number]>(
    SESSION_MODES[0],
  );
  if (focused && focused !== lastMode) setLastMode(focused);
  const mode = focused ?? lastMode;
  return (
    <>
      <FloatingTab
        ref={button}
        icon={mode.icon}
        label={t("tabs.switchMode", { mode: t(mode.label) })}
        isFocused={Boolean(focused)}
        modeSwitch
        testID="session-mode-switch"
        onPress={() =>
          measureAnchor(button.current, (anchor) =>
            menu.open(anchor, {
              items: SESSION_MODES.map((option) => ({
                key: option.key,
                label: t(option.label),
                icon: option.icon,
                selected: option === mode,
                testID: `session-mode-${option.key}`,
                onPress: () => switchTab(option.name, {}),
              })),
            }),
          )
        }
      />
      {menu.menu}
    </>
  );
}
