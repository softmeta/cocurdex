import {
  BACKGROUND_DAEMON_ARG,
  BACKGROUND_USER_DATA_ARG,
  parseBackgroundLaunch,
} from "@cocurdex/daemon/background-launch";
import {
  backgroundLaunchArgs,
  type LoginItemTarget,
  loginItemFor,
} from "@cocurdex/daemon/internal/background/login-item";
import { describe, expect, it } from "vitest";

const mac: LoginItemTarget = {
  platform: "darwin",
  launchCommand: [
    "/Applications/R&D Tools/Cocurdex.app/Contents/MacOS/Cocurdex",
  ],
  userDataPath: "/Users/ada/Library/Application Support/Cocurdex",
  defaultUserDataPath: "/Users/ada/Library/Application Support/Cocurdex",
  homeDir: "/Users/ada",
};

const linux: LoginItemTarget = {
  platform: "linux",
  launchCommand: ["/home/ada/Apps/Cocurdex 100%.AppImage"],
  userDataPath: "/home/ada/.config/Cocurdex",
  defaultUserDataPath: "/home/ada/.config/Cocurdex",
  homeDir: "/home/ada",
};

const windows: LoginItemTarget = {
  platform: "win32",
  launchCommand: [
    "C:\\Users\\Ada\\AppData\\Local\\Programs\\Cocurdex\\Cocurdex.exe",
  ],
  userDataPath: "C:\\Users\\Ada\\AppData\\Roaming\\Cocurdex",
  defaultUserDataPath: "C:\\Users\\Ada\\AppData\\Roaming\\Cocurdex",
  homeDir: "C:\\Users\\Ada",
};

function fileItem(target: LoginItemTarget) {
  const item = loginItemFor(target);
  if (item?.kind !== "file") throw new Error("expected a file login item");
  return item;
}

describe("login item for the background daemon", () => {
  it("registers a macOS launch agent that runs the app launcher once at login", () => {
    const item = fileItem(mac);

    expect(item.path).toMatch(
      /^\/Users\/ada\/Library\/LaunchAgents\/dev\.cocurdex\.daemon\.[0-9a-f]{8}\.plist$/,
    );
    expect(item.content).toContain(
      "<string>/Applications/R&amp;D Tools/Cocurdex.app/Contents/MacOS/Cocurdex</string>",
    );
    expect(item.content).toContain(`<string>${BACKGROUND_DAEMON_ARG}</string>`);
    expect(item.content).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(item.content).not.toContain("KeepAlive");
    expect(item.content).not.toContain(BACKGROUND_USER_DATA_ARG);
  });

  it("gives each data directory its own login item and passes a non-default one to the launcher", () => {
    const devPath = `${mac.defaultUserDataPath}-dev`;
    const dev = fileItem({ ...mac, userDataPath: devPath });

    expect(dev.path).not.toBe(fileItem(mac).path);
    expect(dev.content).toContain(
      `<string>${BACKGROUND_USER_DATA_ARG}=${devPath}</string>`,
    );
    expect(fileItem(mac).path).toBe(fileItem({ ...mac }).path);
  });

  it("writes an XDG autostart entry with Exec quoted per the desktop entry spec", () => {
    const item = fileItem({ ...linux, xdgConfigHome: "/home/ada/.xdg" });

    expect(item.path).toMatch(
      /^\/home\/ada\/\.xdg\/autostart\/cocurdex-daemon-[0-9a-f]{8}\.desktop$/,
    );
    expect(item.content).toContain(
      `Exec="/home/ada/Apps/Cocurdex 100%%.AppImage" ${BACKGROUND_DAEMON_ARG}\n`,
    );
    expect(item.content).toContain("Type=Application\n");
    expect(item.content).toContain("NoDisplay=true\n");
  });

  it("falls back to ~/.config for autostart and escapes shell-reserved characters", () => {
    const item = fileItem({
      ...linux,
      launchCommand: ['/opt/Co"cur$dex/cocurdex'],
    });

    expect(item.path.startsWith("/home/ada/.config/autostart/")).toBe(true);
    expect(item.content).toContain('Exec="/opt/Co\\\\"cur\\\\$dex/cocurdex"');
  });

  it("adds a quoted command to the current user's Run key on Windows", () => {
    const item = loginItemFor({
      ...windows,
      launchCommand: [...windows.launchCommand, "C:\\dev app"],
    });

    expect(item).toMatchObject({
      kind: "registry",
      key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      value: `"C:\\Users\\Ada\\AppData\\Local\\Programs\\Cocurdex\\Cocurdex.exe" "C:\\dev app" ${BACKGROUND_DAEMON_ARG}`,
    });
    expect(item?.kind === "registry" && item.name).toMatch(
      /^Cocurdex Daemon [0-9a-f]{8}$/,
    );
  });

  it("has no login item on platforms without a supported mechanism", () => {
    expect(loginItemFor({ ...linux, platform: "aix" })).toBeNull();
  });

  it("hands the launcher the data directory the login item was registered for", () => {
    const devPath = "/Users/ada/Library/Application Support/Cocurdex-dev";
    expect(parseBackgroundLaunch(backgroundLaunchArgs(mac))).toEqual({
      userDataPath: null,
    });
    expect(
      parseBackgroundLaunch(
        backgroundLaunchArgs({ ...mac, userDataPath: devPath }),
      ),
    ).toEqual({ userDataPath: devPath });
    expect(parseBackgroundLaunch(mac.launchCommand)).toBeNull();
  });
});
