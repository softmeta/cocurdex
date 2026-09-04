import {
  Archive,
  Blocks,
  BookOpen,
  Code2,
  FolderTree,
  Gauge,
  GitBranch,
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
} from "lucide-react";
import type { SettingsSectionId } from "@/app/layout";

// Owned by a leaf module so the screen and the sidebar can both read the
// section list without importing each other.
export const settingsSections = [
  { id: "general", labelKey: "general", icon: Settings, group: "core" },
  { id: "appearance", labelKey: "appearance", icon: Palette, group: "core" },
  { id: "editor", labelKey: "editor", icon: Code2, group: "core" },
  { id: "shortcuts", labelKey: "shortcuts", icon: Keyboard, group: "core" },
  { id: "providers", labelKey: "providers", icon: KeyRound, group: "core" },
  { id: "adapters", labelKey: "adapters", icon: Blocks, group: "core" },
  {
    id: "personalization",
    labelKey: "personalization",
    icon: SlidersHorizontal,
    group: "workspace",
  },
  { id: "mcp", labelKey: "mcp", icon: Server, group: "core" },
  { id: "skills", labelKey: "skills", icon: BookOpen, group: "core" },
  // Network proxy lives in core so the sidebar surfaces it (only core is listed).
  {
    id: "environment",
    labelKey: "environment",
    icon: Network,
    group: "core",
  },
  // Git settings (commit-message model, etc.) must be core so the sidebar
  // lists the section — only the core group is rendered.
  { id: "git", labelKey: "git", icon: GitBranch, group: "core" },
  { id: "licenses", labelKey: "licenses", icon: Scale, group: "core" },
  { id: "about", labelKey: "about", icon: Info, group: "core" },
  {
    id: "workspace",
    labelKey: "workspace",
    icon: FolderTree,
    group: "advanced",
  },
  { id: "computer", labelKey: "computer", icon: Monitor, group: "advanced" },
  { id: "archived", labelKey: "archived", icon: Archive, group: "advanced" },
  { id: "usage", labelKey: "usage", icon: Gauge, group: "advanced" },
] satisfies Array<{
  group: "advanced" | "core" | "workspace";
  icon: typeof Settings;
  id: SettingsSectionId;
  labelKey: SettingsSectionId;
}>;

export type SettingsSectionItem = (typeof settingsSections)[number];
