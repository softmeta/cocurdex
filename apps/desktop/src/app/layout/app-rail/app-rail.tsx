import { useAtomValue, useSetAtom } from "jotai";
import {
  Briefcase,
  Contact,
  Ellipsis,
  type LucideIcon,
  MessageCircle,
  PanelLeft,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownContent, AppDropdownItem } from "@/components/app";
import { DropdownMenu, DropdownMenuTrigger, Separator } from "@/components/ui";
import { openSettings } from "@/features/settings";
import { cn } from "@/lib";
import { APP_RAIL_WIDTH, TITLEBAR_HEIGHT } from "../app-shell/app-shell-layout";
import { PANEL_VIEW_REGISTRY } from "../panel-view-registry";
import type { AppView } from "../right-panel-tab-sets";
import type { SidebarTab } from "../sidebar/sidebar-tab-store";
import {
  type RailItem,
  railSelectionAtom,
  selectRailItemAtom,
} from "./app-rail-actions";
import { AppRailButton } from "./app-rail-button";

const SESSION_ITEMS: readonly {
  id: SidebarTab;
  icon: LucideIcon;
  labelKey:
    | "personal:sidebar.title"
    | "sessions:sidebar.workspacesGroup"
    | "chat:sidebar.title";
}[] = [
  { id: "personal", icon: Contact, labelKey: "personal:sidebar.title" },
  {
    id: "workspaces",
    icon: Briefcase,
    labelKey: "sessions:sidebar.workspacesGroup",
  },
  { id: "chat", icon: MessageCircle, labelKey: "chat:sidebar.title" },
];

const PRIMARY_APPS: readonly AppView[] = ["issues", "notes"];
const MORE_APPS: readonly AppView[] = ["decks", "routines", "memory"];

export function AppRail({
  besideSidebar,
  sidebarToggle,
}: {
  besideSidebar: boolean;
  sidebarToggle: { open: boolean; onToggle(): void } | null;
}) {
  const { t } = useTranslation(["sessions", "personal", "chat", "editor"]);
  const selection = useAtomValue(railSelectionAtom);
  const select = useSetAtom(selectRailItemAtom);
  const appButton = (id: AppView) => {
    const def = PANEL_VIEW_REGISTRY[id];
    return (
      <AppRailButton
        key={id}
        active={selection === id}
        icon={def.icon}
        label={t(`editor:${def.labelKey}`)}
        onClick={() => select(id)}
      />
    );
  };
  const moreActive = MORE_APPS.includes(selection as AppView);

  return (
    <nav
      aria-label={t("sessions:rail.label")}
      className={cn(
        "app-no-drag flex h-full shrink-0 flex-col items-center gap-1 bg-app pb-2",
        besideSidebar && "bg-sidebar",
      )}
      data-testid="app-rail"
      data-window-sidebar={besideSidebar ? "" : undefined}
      data-window-content={besideSidebar ? undefined : ""}
      style={{ width: APP_RAIL_WIDTH, paddingTop: TITLEBAR_HEIGHT + 4 }}
    >
      {SESSION_ITEMS.map((item) => (
        <AppRailButton
          key={item.id}
          active={selection === item.id}
          icon={item.icon}
          label={t(item.labelKey)}
          onClick={() => select(item.id satisfies RailItem)}
        />
      ))}
      <Separator className="my-1 bg-sidebar-divider data-[orientation=horizontal]:w-5" />
      {PRIMARY_APPS.map(appButton)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AppRailButton
            active={moreActive}
            icon={Ellipsis}
            label={t("sessions:rail.more")}
          />
        </DropdownMenuTrigger>
        <AppDropdownContent align="start" side="right">
          {MORE_APPS.map((id) => {
            const def = PANEL_VIEW_REGISTRY[id];
            const Icon = def.icon;
            return (
              <AppDropdownItem
                key={id}
                onClick={() => select(id)}
                selected={selection === id}
              >
                <Icon className="size-3.5" />
                {t(`editor:${def.labelKey}`)}
              </AppDropdownItem>
            );
          })}
        </AppDropdownContent>
      </DropdownMenu>
      <div className="min-h-0 flex-1" />
      {sidebarToggle ? (
        <AppRailButton
          active={false}
          aria-pressed={sidebarToggle.open}
          icon={PanelLeft}
          label={t("editor:actions.toggleSidebar")}
          onClick={sidebarToggle.onToggle}
        />
      ) : null}
      <AppRailButton
        active={false}
        icon={Settings}
        label={t("sessions:sidebar.settings")}
        onClick={() => openSettings()}
      />
    </nav>
  );
}
