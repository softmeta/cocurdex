import { createHash } from "node:crypto";
import path from "node:path";
import { BACKGROUND_DAEMON_ARG, BACKGROUND_USER_DATA_ARG } from "./launch-args";

const WINDOWS_RUN_KEY =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const DESKTOP_ENTRY_RESERVED = /[\s"'\\><~|&;$*?#()`]/;
const WINDOWS_BARE_ARG = /^[\w.=-]+$/;

export interface LoginItemTarget {
  platform: NodeJS.Platform;
  launchCommand: readonly string[];
  userDataPath: string;
  defaultUserDataPath: string;
  homeDir: string;
  xdgConfigHome?: string;
}

export type LoginItem =
  | { kind: "file"; path: string; content: string }
  | { kind: "registry"; key: string; name: string; value: string };

function profileId(userDataPath: string) {
  return createHash("sha256").update(userDataPath).digest("hex").slice(0, 8);
}

export function backgroundLaunchArgs(target: LoginItemTarget) {
  const userDataArgs =
    target.userDataPath === target.defaultUserDataPath
      ? []
      : [`${BACKGROUND_USER_DATA_ARG}=${target.userDataPath}`];
  return [...target.launchCommand, BACKGROUND_DAEMON_ARG, ...userDataArgs];
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function launchAgent(target: LoginItemTarget): LoginItem {
  const label = `dev.cocurdex.daemon.${profileId(target.userDataPath)}`;
  const programArguments = backgroundLaunchArgs(target)
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join("\n");
  const content = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${label}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    programArguments,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>LimitLoadToSessionType</key>",
    "  <string>Aqua</string>",
    "  <key>ProcessType</key>",
    "  <string>Interactive</string>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
  return {
    kind: "file",
    path: path.posix.join(
      target.homeDir,
      "Library",
      "LaunchAgents",
      `${label}.plist`,
    ),
    content,
  };
}

function desktopEntryArg(arg: string) {
  const percentSafe = arg.replaceAll("%", "%%");
  if (!DESKTOP_ENTRY_RESERVED.test(arg)) return percentSafe;
  const quoted = percentSafe.replace(/["`$\\]/g, (char) => `\\${char}`);
  return `"${quoted.replaceAll("\\", "\\\\")}"`;
}

function autostartEntry(target: LoginItemTarget): LoginItem {
  const configHome =
    target.xdgConfigHome || path.posix.join(target.homeDir, ".config");
  const exec = backgroundLaunchArgs(target).map(desktopEntryArg).join(" ");
  const content = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Cocurdex daemon",
    `Exec=${exec}`,
    "Terminal=false",
    "NoDisplay=true",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
  return {
    kind: "file",
    path: path.posix.join(
      configHome,
      "autostart",
      `cocurdex-daemon-${profileId(target.userDataPath)}.desktop`,
    ),
    content,
  };
}

function windowsArg(arg: string) {
  if (WINDOWS_BARE_ARG.test(arg)) return arg;
  let escaped = "";
  let slashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      slashes += 1;
      continue;
    }
    const doubled = char === '"' ? slashes * 2 + 1 : slashes;
    escaped += `${"\\".repeat(doubled)}${char}`;
    slashes = 0;
  }
  return `"${escaped}${"\\".repeat(slashes * 2)}"`;
}

function runKeyEntry(target: LoginItemTarget): LoginItem {
  return {
    kind: "registry",
    key: WINDOWS_RUN_KEY,
    name: `Cocurdex Daemon ${profileId(target.userDataPath)}`,
    value: backgroundLaunchArgs(target).map(windowsArg).join(" "),
  };
}

export function loginItemFor(target: LoginItemTarget): LoginItem | null {
  if (target.platform === "darwin") return launchAgent(target);
  if (target.platform === "win32") return runKeyEntry(target);
  if (target.platform === "linux" || target.platform === "freebsd") {
    return autostartEntry(target);
  }
  return null;
}
