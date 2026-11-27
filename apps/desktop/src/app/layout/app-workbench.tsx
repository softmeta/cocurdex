import { useAtom, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { ResizableSidebar, WORKBENCH_SIDEBAR_WIDTH_PX } from "@/components";
import { cn } from "@/lib";
import { activeAppAtom } from "./app-rail/app-rail-store";
import { useAppSidebarCollapsed } from "./app-rail/app-sidebar-store";
import {
  MAX_LEFT,
  MIN_LEFT,
  TITLEBAR_HEIGHT,
} from "./app-shell/app-shell-layout";
import { windowSidebarWidthAtom } from "./app-shell/sidebar-width-store";
import { persistLeftWidth } from "./chat-layout-preference";
import type { AppView } from "./right-panel-tab-sets";

interface AppWorkbenchProps {
  app: AppView;
  ariaLabel?: string;
  sidebar: ReactNode;
  sidebarResizeLabel: string;
  contentMinWidth: number;
  children: ReactNode;
}

export function AppWorkbench({
  app,
  ariaLabel,
  sidebar,
  sidebarResizeLabel,
  contentMinWidth,
  children,
}: AppWorkbenchProps) {
  const isWindowApp = useAtomValue(activeAppAtom) === app;
  const isCollapsed = useAppSidebarCollapsed(app) && isWindowApp;
  const [sharedWidth, setSharedWidth] = useAtom(windowSidebarWidthAtom);
  const sidebarWidth = isWindowApp ? sharedWidth : WORKBENCH_SIDEBAR_WIDTH_PX;
  const titlebarSpacer = isWindowApp ? (
    <div
      aria-hidden
      className="app-drag shrink-0"
      style={{ height: TITLEBAR_HEIGHT }}
    />
  ) : null;
  return (
    <section
      aria-label={ariaLabel}
      className="flex min-h-0 flex-1"
      style={{ minWidth: sidebarWidth + contentMinWidth }}
    >
      {isCollapsed ? null : (
        <ResizableSidebar
          ariaLabel={sidebarResizeLabel}
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
          {...(isWindowApp
            ? {
                width: sharedWidth,
                minWidth: MIN_LEFT,
                maxWidth: MAX_LEFT,
                onWidthChange: setSharedWidth,
                onWidthCommit: persistLeftWidth,
              }
            : {})}
          surface={isWindowApp ? "sidebar" : "editor"}
        >
          {titlebarSpacer}
          {sidebar}
        </ResizableSidebar>
      )}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1",
          isWindowApp && "bg-sidebar",
        )}
        data-window-sidebar-edge={isWindowApp ? "" : undefined}
        style={{ minWidth: contentMinWidth }}
      >
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas",
            isWindowApp && !isCollapsed && "rounded-s-card",
          )}
          data-window-content={isWindowApp ? "" : undefined}
        >
          {titlebarSpacer}
          {children}
        </div>
      </div>
    </section>
  );
}
