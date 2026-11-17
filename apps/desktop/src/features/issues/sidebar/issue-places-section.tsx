import {
  type IssuePlace,
  isSameIssuePlace,
  workspacesWithIssues,
} from "@cocurdex/client-runtime";
import type {
  IssueActivityLookup,
  IssueRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Bot, Folder, Hand, Inbox, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarSectionHeader } from "@/components";
import { SidebarListRow, SidebarListRowLabel } from "@/components/ui";
import { countNavPlace, type IssueNavPreset } from "./issue-nav";

interface PlaceContext {
  issues: readonly IssueRecord[];
  preset: IssueNavPreset;
  activePlace: IssuePlace | null;
  activityOf: IssueActivityLookup;
  onSelectPlace: (place: IssuePlace) => void;
}

function PlaceRow({
  place,
  icon: Icon,
  label,
  context,
}: {
  place: IssuePlace;
  icon: LucideIcon;
  label: string;
  context: PlaceContext;
}) {
  const active =
    context.activePlace !== null &&
    isSameIssuePlace(place, context.activePlace);
  const count = countNavPlace(
    context.issues,
    context.preset,
    place,
    context.activityOf,
  );
  return (
    <SidebarListRow
      isActive={active}
      aria-current={active ? "page" : undefined}
      render={<button type="button" />}
      onClick={() => context.onSelectPlace(place)}
    >
      <Icon className="text-sidebar-fg-muted" />
      <SidebarListRowLabel>{label}</SidebarListRowLabel>
      {count > 0 ? (
        <span className="shrink-0 text-meta tabular-nums text-sidebar-fg-muted">
          {count}
        </span>
      ) : null}
    </SidebarListRow>
  );
}

export function IssueAllRow({ context }: { context: PlaceContext }) {
  const { t } = useTranslation("issues");
  return (
    <PlaceRow
      place={{ kind: "all" }}
      icon={Inbox}
      label={t("sidebar.nav.all")}
      context={context}
    />
  );
}

export function IssueAgentSection({ context }: { context: PlaceContext }) {
  const { t } = useTranslation("issues");
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      <SidebarSectionHeader
        title={t("sidebar.agent.title")}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />
      {collapsed ? null : (
        <>
          <PlaceRow
            place={{ kind: "agent", activity: "working" }}
            icon={Bot}
            label={t("sidebar.agent.working")}
            context={context}
          />
          <PlaceRow
            place={{ kind: "agent", activity: "needsYou" }}
            icon={Hand}
            label={t("sidebar.agent.needsYou")}
            context={context}
          />
        </>
      )}
    </>
  );
}

export function IssueWorkspacesSection({
  workspaces,
  context,
}: {
  workspaces: readonly WorkspaceRecord[];
  context: PlaceContext;
}) {
  const { t } = useTranslation("issues");
  const [collapsed, setCollapsed] = useState(false);
  const listed = workspacesWithIssues(workspaces, context.issues);
  if (listed.length === 0) {
    return null;
  }
  return (
    <>
      <SidebarSectionHeader
        title={t("sidebar.workspaces")}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />
      {collapsed
        ? null
        : listed.map((workspace) => (
            <PlaceRow
              key={workspace.id}
              place={{ kind: "workspace", workspaceId: workspace.id }}
              icon={Folder}
              label={workspace.name}
              context={context}
            />
          ))}
    </>
  );
}

export type { PlaceContext };
