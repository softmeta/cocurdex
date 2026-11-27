import { MemoryStatusButton } from "@/features/memory";
import { AppsEntryButton, NetworkProxyStatusButton } from "@/features/settings";
import { hostHasScope } from "@/lib";
import type { SidebarTab } from "./sidebar-tab-store";

export function SidebarFooter({ activeTab }: { activeTab: SidebarTab }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 pe-1.75 ps-3">
      {activeTab !== "chat" ? <AppsEntryButton /> : null}
      <div className="min-w-0 flex-1" />
      {activeTab === "personal" ? <MemoryStatusButton /> : null}
      {hostHasScope("host.admin") ? <NetworkProxyStatusButton /> : null}
    </div>
  );
}
