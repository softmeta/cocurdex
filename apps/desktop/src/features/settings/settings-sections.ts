import type { HostAccessScope } from "@cocurdex/shared";
import {
  Archive,
  Blocks,
  BookOpen,
  Brain,
  Code2,
  Folder,
  Gauge,
  GitBranch,
  GitFork,
  Info,
  Keyboard,
  KeyRound,
  Monitor,
  Network,
  Palette,
  Scale,
  Server,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";

export const settingsClusters = [
  "interface",
  "agent",
  "workspace",
  "system",
] as const;

export type SettingsClusterId = (typeof settingsClusters)[number];

// Owned by a leaf module so the screen and the sidebar can both read the
// section list without importing each other.
export const settingsSections = [
  { id: "general", labelKey: "general", icon: Settings, cluster: "interface" },
  {
    id: "appearance",
    labelKey: "appearance",
    icon: Palette,
    cluster: "interface",
  },
  { id: "editor", labelKey: "editor", icon: Code2, cluster: "interface" },
  {
    id: "shortcuts",
    labelKey: "shortcuts",
    icon: Keyboard,
    cluster: "interface",
  },
  {
    id: "providers",
    labelKey: "providers",
    icon: KeyRound,
    cluster: "agent",
    requires: "credentials",
  },
  {
    id: "adapters",
    labelKey: "adapters",
    icon: Blocks,
    cluster: "agent",
    requires: "host.admin",
  },
  {
    id: "agentRoles",
    labelKey: "agentRoles",
    icon: UserCog,
    cluster: "agent",
    requires: "interact",
  },
  {
    id: "teams",
    labelKey: "teams",
    icon: Users,
    cluster: "agent",
    requires: "interact",
  },
  {
    id: "mcp",
    labelKey: "mcp",
    icon: Server,
    cluster: "agent",
    requires: "credentials",
  },
  {
    id: "memory",
    labelKey: "memory",
    icon: Brain,
    cluster: "agent",
    requires: "host.admin",
  },
  {
    id: "skills",
    labelKey: "skills",
    icon: BookOpen,
    cluster: "agent",
    requires: "host.admin",
  },
  {
    id: "git",
    labelKey: "git",
    icon: GitBranch,
    cluster: "workspace",
    requires: "host.admin",
  },
  {
    id: "worktrees",
    labelKey: "worktrees",
    icon: GitFork,
    cluster: "workspace",
    requires: "host.admin",
  },
  {
    id: "workspaces",
    labelKey: "workspaces",
    icon: Folder,
    cluster: "workspace",
    requires: "files.write",
  },
  {
    id: "environment",
    labelKey: "environment",
    icon: Network,
    cluster: "system",
    requires: "host.admin",
  },
  {
    id: "devices",
    labelKey: "devices",
    icon: Smartphone,
    cluster: "system",
    requires: "host.admin",
  },
  { id: "licenses", labelKey: "licenses", icon: Scale, cluster: "system" },
  { id: "about", labelKey: "about", icon: Info, cluster: "system" },
  {
    id: "archived",
    labelKey: "archived",
    icon: Archive,
    cluster: "system",
    requires: "read",
  },
  {
    id: "diagnostics",
    labelKey: "diagnostics",
    icon: Stethoscope,
    cluster: "system",
    requires: "host.admin",
  },
  {
    id: "personalization",
    labelKey: "personalization",
    icon: SlidersHorizontal,
    cluster: "hidden",
  },
  {
    id: "computer",
    labelKey: "computer",
    icon: Monitor,
    cluster: "hidden",
    requires: "host.admin",
  },
  {
    id: "usage",
    labelKey: "usage",
    icon: Gauge,
    cluster: "hidden",
    requires: "read",
  },
] satisfies Array<{
  cluster: SettingsClusterId | "hidden";
  icon: typeof Settings;
  id: SettingsSectionId;
  labelKey: SettingsSectionId;
  requires?: HostAccessScope;
}>;

export type SettingsSectionItem = (typeof settingsSections)[number];

export type SettingsClusterGroup = {
  id: SettingsClusterId;
  items: SettingsSectionItem[];
};

function sectionAllowed(
  section: SettingsSectionItem,
  scopes: readonly HostAccessScope[],
) {
  const required = "requires" in section ? section.requires : undefined;
  return !required || scopes.includes(required);
}

export function permittedSettingsSection(
  sectionId: SettingsSectionId,
  scopes: readonly HostAccessScope[],
): SettingsSectionId {
  const section = settingsSections.find((item) => item.id === sectionId);
  if (section && !sectionAllowed(section, scopes))
    return settingsSections[0].id;
  return sectionId;
}

export function groupSettingsSectionsByCluster(
  scopes: readonly HostAccessScope[],
): SettingsClusterGroup[] {
  return settingsClusters
    .map((id) => ({
      id,
      items: settingsSections.filter(
        (section) => section.cluster === id && sectionAllowed(section, scopes),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
