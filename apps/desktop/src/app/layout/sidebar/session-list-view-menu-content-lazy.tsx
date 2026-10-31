import { lazyComponent } from "@/lib";
import type { SessionListViewMenuContentProps } from "./session-list-view-menu-content";

export const SessionListViewMenuContent =
  lazyComponent<SessionListViewMenuContentProps>(
    async () =>
      (await import("./session-list-view-menu-content"))
        .SessionListViewMenuContent,
  );
