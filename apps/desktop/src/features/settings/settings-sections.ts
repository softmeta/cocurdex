import {
  Archive,
  Blocks,
  BookOpen,
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
  { id: "providers", labelKey: "providers", icon: KeyRound, cluster: "agent" },
  { id: "adapters", labelKey: "adapters", icon: Blocks, cluster: "agent" },
  { id: "agentRoles", labelKey: "agentRoles", icon: UserCog, cluster: "agent" },
  { id: "teams", labelKey: "teams", icon: Users, cluster: "agent" },
  { id: "mcp", labelKey: "mcp", icon: Server, cluster: "agent" },
  { id: "skills", labelKey: "skills", icon: BookOpen, cluster: "agent" },
  { id: "git", labelKey: "git", icon: GitBranch, cluster: "workspace" },
  {
    id: "worktrees",
    labelKey: "worktrees",
    icon: GitFork,
    cluster: "workspace",
  },
  {
    id: "workspaces",
    labelKey: "workspaces",
    icon: Folder,
    cluster: "workspace",
  },
  {
    id: "environment",
    labelKey: "environment",
    icon: Network,
    cluster: "system",
  },
  { id: "licenses", labelKey: "licenses", icon: Scale, cluster: "system" },
  { id: "about", labelKey: "about", icon: Info, cluster: "system" },
  { id: "archived", labelKey: "archived", icon: Archive, cluster: "system" },
  {
    id: "diagnostics",
    labelKey: "diagnostics",
    icon: Stethoscope,
    cluster: "system",
  },
  {
    id: "personalization",
    labelKey: "personalization",
    icon: SlidersHorizontal,
    cluster: "hidden",
  },
  { id: "computer", labelKey: "computer", icon: Monitor, cluster: "hidden" },
  { id: "usage", labelKey: "usage", icon: Gauge, cluster: "hidden" },
] satisfies Array<{
  cluster: SettingsClusterId | "hidden";
  icon: typeof Settings;
  id: SettingsSectionId;
  labelKey: SettingsSectionId;
}>;

export type SettingsSectionItem = (typeof settingsSections)[number];

export type SettingsClusterGroup = {
  id: SettingsClusterId;
  items: SettingsSectionItem[];
};

export function groupSettingsSectionsByCluster(): SettingsClusterGroup[] {
  return settingsClusters
    .map((id) => ({
      id,
      items: settingsSections.filter((section) => section.cluster === id),
    }))
    .filter((group) => group.items.length > 0);
}
