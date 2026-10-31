import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import { FloatingTab, FloatingTabBar, useFloatingTabBarInset } from "@/tabs";
import { TabBarInsetContext, useKeyboardVisible } from "@/ui";

const TABS = [
  {
    name: "(sessions)",
    href: "/",
    icon: { ios: "bubble.left.and.bubble.right", android: "forum" },
    label: "tabs.sessions",
  },
  {
    name: "issues",
    href: "/issues",
    icon: { ios: "circle.circle", android: "adjust" },
    label: "tabs.issues",
  },
  {
    name: "notes",
    href: "/notes",
    icon: { ios: "doc.text", android: "description" },
    label: "tabs.notes",
  },
  {
    name: "settings",
    href: "/settings",
    icon: { ios: "gearshape", android: "settings" },
    label: "tabs.settings",
  },
] as const;

export default function TabsLayout() {
  const { t } = useTranslation();
  const inset = useFloatingTabBarInset();
  const keyboardVisible = useKeyboardVisible();
  return (
    <Tabs style={styles.fill}>
      <TabBarInsetContext value={inset}>
        <TabSlot />
      </TabBarInsetContext>
      <TabList asChild>
        <FloatingTabBar hidden={keyboardVisible}>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <FloatingTab icon={tab.icon} label={t(tab.label)} />
            </TabTrigger>
          ))}
        </FloatingTabBar>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
