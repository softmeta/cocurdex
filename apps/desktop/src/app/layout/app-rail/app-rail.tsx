import { useAtomValue, useSetAtom } from "jotai";
import {
  Briefcase,
  Contact,
  Ellipsis,
  type LucideIcon,
  MessageCircle,
  PanelLeft,
  Pin,
  PinOff,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownContent, AppDropdownItem } from "@/components/app";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  IconButton,
  Separator,
} from "@/components/ui";
import { openSettings } from "@/features/settings";
import { cn } from "@/lib";
import { APP_RAIL_WIDTH, TITLEBAR_HEIGHT } from "../app-shell/app-shell-layout";
import { PANEL_VIEW_REGISTRY } from "../panel-view-registry";
import { APP_VIEWS, type AppView } from "../right-panel-tab-sets";
import type { SidebarTab } from "../sidebar/sidebar-tab-store";
import {
  type RailItem,
  railSelectionAtom,
  selectRailItemAtom,
} from "./app-rail-actions";
import { AppRailButton } from "./app-rail-button";
import { railPinnedAppsAtom, setRailAppPinnedAtom } from "./app-rail-store";

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
  const pinnedApps = useAtomValue(railPinnedAppsAtom);
  const setPinned = useSetAtom(setRailAppPinnedAtom);
  const moreApps = APP_VIEWS.filter((app) => !pinnedApps.includes(app));
  const appLabel = (id: AppView) =>
    t(`editor:${PANEL_VIEW_REGISTRY[id].labelKey}`);
  const moreActive = moreApps.includes(selection as AppView);

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
      {pinnedApps.map((id) => (
        <ContextMenu key={id}>
          <ContextMenuTrigger className="flex">
            <AppRailButton
              active={selection === id}
              icon={PANEL_VIEW_REGISTRY[id].icon}
              label={appLabel(id)}
              onClick={() => select(id)}
            />
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => setPinned({ app: id, pinned: false })}
            >
              <PinOff className="size-3.5" />
              {t("sessions:rail.unpin")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {moreApps.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AppRailButton
              active={moreActive}
              icon={Ellipsis}
              label={t("sessions:rail.more")}
            />
          </DropdownMenuTrigger>
          <AppDropdownContent align="start" side="right">
            {moreApps.map((id) => {
              const Icon = PANEL_VIEW_REGISTRY[id].icon;
              return (
                <div className="group/rail-app relative" key={id}>
                  <AppDropdownItem
                    className="pe-9"
                    onClick={() => select(id)}
                    selected={selection === id}
                  >
                    <Icon className="size-3.5" />
                    {appLabel(id)}
                  </AppDropdownItem>
                  <div className="absolute inset-y-0 end-1 flex items-center opacity-0 group-hover/rail-app:opacity-100 focus-within:opacity-100">
                    <IconButton
                      aria-label={t("sessions:rail.pin")}
                      size="xs"
                      tooltipSide="right"
                      onClick={() => setPinned({ app: id, pinned: true })}
                    >
                      <Pin className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </AppDropdownContent>
        </DropdownMenu>
      ) : null}
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
