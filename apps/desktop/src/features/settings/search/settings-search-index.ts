import type { ParseKeys } from "i18next";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import { shortcutIds } from "@/features/shortcuts";
import type { HostCapabilities } from "@/lib";

type SettingsKey = ParseKeys<"settings">;
type MemoryKey = ParseKeys<"memory">;

export type SettingsSearchTextKey =
  | { ns: "settings"; key: SettingsKey }
  | { ns: "memory"; key: MemoryKey };

export interface SettingsSearchEntry {
  id: string;
  section: SettingsSectionId;
  title: SettingsSearchTextKey;
  description?: SettingsSearchTextKey;
  group?: SettingsSearchTextKey;
  fallbackId?: string;
  requires?: HostCapabilityFlag;
}

type HostCapabilityFlag = {
  [K in keyof HostCapabilities]-?: HostCapabilities[K] extends boolean
    ? K
    : never;
}[keyof HostCapabilities];

function s(key: SettingsKey): SettingsSearchTextKey {
  return { ns: "settings", key };
}

function m(key: MemoryKey): SettingsSearchTextKey {
  return { ns: "memory", key };
}

function row(
  section: SettingsSectionId,
  id: string,
  title: SettingsSearchTextKey,
  description?: SettingsSearchTextKey,
  group?: SettingsSearchTextKey,
): SettingsSearchEntry {
  return { id: `${section}.${id}`, section, title, description, group };
}

function requiring(
  entry: SettingsSearchEntry,
  requires: HostCapabilityFlag,
): SettingsSearchEntry {
  return { ...entry, requires };
}

function shownVia(
  entry: SettingsSearchEntry,
  fallbackId: string,
): SettingsSearchEntry {
  return { ...entry, fallbackId };
}

const chatDisplay = s("chatDisplay.groupTitle");
const followUp = s("followUp.groupTitle");
const notifications = s("notifications.groupTitle");
const typography = s("appearance.typography.groupTitle");
const commitModel = s("git.commitMessageModel.group");
const worktrees = s("worktrees.groupTitle");
const memory = m("settings.groupTitle");
const runLimits = s("teams.runLimits.title");
const proxy = s("network.proxy.groupTitle");
const manualProxy = s("network.proxy.manualGroupTitle");
const remote = s("devices.remote.groupTitle");
const relay = s("devices.relay.groupTitle");
const diagnostics = s("diagnostics.group");

const shortcutEntries = shortcutIds.map((id) =>
  row(
    "shortcuts",
    id,
    s(`shortcuts.actions.${id}.title`),
    s(`shortcuts.actions.${id}.description`),
  ),
);

export const settingsSearchEntries: readonly SettingsSearchEntry[] = [
  row(
    "general",
    "chatLayout",
    s("chatDisplay.layout.title"),
    s("chatDisplay.layout.description"),
    chatDisplay,
  ),
  row(
    "general",
    "hideFab",
    s("chatDisplay.hideFab.title"),
    s("chatDisplay.hideFab.description"),
    chatDisplay,
  ),
  row(
    "general",
    "activity",
    s("chatDisplay.activity.title"),
    s("chatDisplay.activity.description"),
    chatDisplay,
  ),
  row(
    "general",
    "htmlPreview",
    s("chatDisplay.htmlPreview.title"),
    s("chatDisplay.htmlPreview.description"),
    chatDisplay,
  ),
  row(
    "general",
    "sendShortcut",
    s("sendShortcut.title"),
    s("sendShortcut.description"),
    followUp,
  ),
  row(
    "general",
    "followUp",
    s("followUp.title"),
    s("followUp.description"),
    followUp,
  ),
  row(
    "general",
    "language",
    s("language.title"),
    s("language.description"),
    s("language.groupTitle"),
  ),
  row(
    "general",
    "systemNotifications",
    s("notifications.systemNotifications.title"),
    s("notifications.systemNotifications.description"),
    notifications,
  ),
  row(
    "general",
    "completionSound",
    s("notifications.completionSound.title"),
    s("notifications.completionSound.description"),
    notifications,
  ),
  requiring(
    row(
      "general",
      "cli",
      s("cli.title"),
      s("cli.description"),
      s("cli.groupTitle"),
    ),
    "localDaemonControl",
  ),
  requiring(
    row(
      "general",
      "daemon",
      s("daemon.title"),
      s("daemon.description"),
      s("daemon.groupTitle"),
    ),
    "localDaemonControl",
  ),
  requiring(
    row(
      "general",
      "daemonBackground",
      s("daemon.background.title"),
      s("daemon.background.description"),
      s("daemon.groupTitle"),
    ),
    "localDaemonControl",
  ),
  row(
    "appearance",
    "theme",
    s("appearance.theme.title"),
    s("appearance.theme.description"),
  ),
  row(
    "appearance",
    "preset",
    s("appearance.preset.title"),
    s("appearance.preset.description"),
  ),
  requiring(
    row(
      "appearance",
      "translucentSidebar",
      s("appearance.translucentSidebar.title"),
      s("appearance.translucentSidebar.description"),
    ),
    "windowMaterial",
  ),
  requiring(
    row(
      "appearance",
      "sidebarTransparency",
      s("appearance.sidebarTransparency.title"),
      s("appearance.sidebarTransparency.description"),
    ),
    "windowMaterial",
  ),
  row(
    "appearance",
    "uiFontSize",
    s("appearance.typography.uiFontSize.title"),
    s("appearance.typography.uiFontSize.description"),
    typography,
  ),
  row(
    "appearance",
    "codeFontSize",
    s("appearance.typography.codeFontSize.title"),
    s("appearance.typography.codeFontSize.description"),
    typography,
  ),
  row(
    "appearance",
    "uiFontFamily",
    s("appearance.typography.uiFontFamily.title"),
    s("appearance.typography.uiFontFamily.description"),
    typography,
  ),
  row(
    "appearance",
    "codeFontFamily",
    s("appearance.typography.codeFontFamily.title"),
    s("appearance.typography.codeFontFamily.description"),
    typography,
  ),
  row(
    "editor",
    "minimap",
    s("editor.minimap.title"),
    s("editor.minimap.description"),
  ),
  ...shortcutEntries,
  row(
    "memory",
    "enabled",
    m("settings.enabled.title"),
    m("settings.enabled.description"),
    memory,
  ),
  row(
    "memory",
    "agentContext",
    m("settings.agentContext.title"),
    m("settings.agentContext.description"),
    memory,
  ),
  row(
    "memory",
    "agentTools",
    m("settings.agentTools.title"),
    m("settings.agentTools.description"),
    memory,
  ),
  row(
    "memory",
    "chatRecall",
    m("settings.chatRecall.title"),
    m("settings.chatRecall.description"),
    memory,
  ),
  row(
    "memory",
    "chatSaveTurns",
    m("settings.chatSaveTurns.title"),
    m("settings.chatSaveTurns.description"),
    memory,
  ),
  row(
    "memory",
    "chatSaveOnEnd",
    m("settings.chatSaveOnEnd.title"),
    m("settings.chatSaveOnEnd.description"),
    memory,
  ),
  row(
    "memory",
    "cloud",
    m("settings.cloud.title"),
    undefined,
    m("settings.cloudTitle"),
  ),
  row(
    "memory",
    "cliPath",
    m("settings.cliPath.title"),
    m("settings.cliPath.description"),
    m("settings.connectionTitle"),
  ),
  row(
    "teams",
    "maxConcurrentRuns",
    s("teams.runLimits.maxConcurrentRuns.title"),
    s("teams.runLimits.maxConcurrentRuns.description"),
    runLimits,
  ),
  row(
    "teams",
    "maxConcurrentRunsPerAgent",
    s("teams.runLimits.maxConcurrentRunsPerAgent.title"),
    s("teams.runLimits.maxConcurrentRunsPerAgent.description"),
    runLimits,
  ),
  row(
    "teams",
    "runTimeout",
    s("teams.runLimits.timeout.title"),
    s("teams.runLimits.timeout.description"),
    runLimits,
  ),
  row(
    "teams",
    "scriptRuns",
    s("teams.scriptRuns.title"),
    s("teams.scriptRuns.description"),
  ),
  row(
    "git",
    "commitAgent",
    s("git.commitMessageModel.agentLabel"),
    s("git.commitMessageModel.agentDescription"),
    commitModel,
  ),
  row(
    "git",
    "commitModel",
    s("git.commitMessageModel.modelLabel"),
    s("git.commitMessageModel.modelDescription"),
    commitModel,
  ),
  row(
    "worktrees",
    "root",
    s("worktrees.rootTitle"),
    s("worktrees.rootDescription"),
    worktrees,
  ),
  row(
    "worktrees",
    "fetch",
    s("worktrees.fetchTitle"),
    s("worktrees.fetchDescription"),
    worktrees,
  ),
  row(
    "environment",
    "proxyMode",
    s("network.proxy.modeTitle"),
    s("network.proxy.scopeDescription"),
    proxy,
  ),
  shownVia(
    row(
      "environment",
      "httpProxy",
      s("network.proxy.httpProxy.title"),
      s("network.proxy.httpProxy.description"),
      manualProxy,
    ),
    "environment.proxyMode",
  ),
  shownVia(
    row(
      "environment",
      "httpsProxy",
      s("network.proxy.httpsProxy.title"),
      s("network.proxy.httpsProxy.description"),
      manualProxy,
    ),
    "environment.proxyMode",
  ),
  shownVia(
    row(
      "environment",
      "allProxy",
      s("network.proxy.allProxy.title"),
      s("network.proxy.allProxy.description"),
      manualProxy,
    ),
    "environment.proxyMode",
  ),
  shownVia(
    row(
      "environment",
      "noProxy",
      s("network.proxy.noProxy.title"),
      s("network.proxy.noProxy.description"),
      manualProxy,
    ),
    "environment.proxyMode",
  ),
  row(
    "environment",
    "proxyTest",
    s("network.proxy.test.title"),
    s("network.proxy.test.description"),
    proxy,
  ),
  requiring(
    row(
      "devices",
      "localWeb",
      s("devices.localWeb.open.title"),
      s("devices.localWeb.open.description"),
      s("devices.localWeb.groupTitle"),
    ),
    "localWebClient",
  ),
  row(
    "devices",
    "remoteEnable",
    s("devices.remote.enable.title"),
    s("devices.remote.enable.description"),
    remote,
  ),
  row(
    "devices",
    "keepAwake",
    s("devices.remote.keepAwake.title"),
    s("devices.remote.keepAwake.description"),
    remote,
  ),
  row(
    "devices",
    "remotePort",
    s("devices.remote.port.title"),
    s("devices.remote.port.description"),
    remote,
  ),
  row(
    "devices",
    "relayUrl",
    s("devices.relay.url.title"),
    s("devices.relay.url.description"),
    relay,
  ),
  row(
    "devices",
    "relayOnly",
    s("devices.relay.relayOnly.title"),
    s("devices.relay.relayOnly.description"),
    relay,
  ),
  row(
    "devices",
    "relayCredential",
    s("devices.relay.credential.title"),
    s("devices.relay.credential.description"),
    relay,
  ),
  row("devices", "pairedDevices", s("devices.list.groupTitle")),
  row("devices", "accessLog", s("devices.audit.groupTitle")),
  row("about", "updates", s("updates.title"), s("updates.description")),
  row(
    "about",
    "updateChannel",
    s("updates.channel.title"),
    s("updates.channel.description"),
  ),
  row(
    "diagnostics",
    "verbose",
    s("diagnostics.verbose.title"),
    s("diagnostics.verbose.description"),
    diagnostics,
  ),
  row(
    "diagnostics",
    "export",
    s("diagnostics.title"),
    s("diagnostics.description"),
    diagnostics,
  ),
];
