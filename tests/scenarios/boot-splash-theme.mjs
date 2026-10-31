import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";

const THEME_MODE_STORAGE_KEY = "agents.desktop.theme-mode";
const RENDERER_ENTRY_PATTERNS = ["*/src/main.tsx*", "*/assets/index-*.js"];
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function readStoredThemeMode(key) {
  return window.localStorage.getItem(key);
}

function storeThemeMode({ key, value }) {
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
  return true;
}

function readStaticSplash() {
  const splash = document.querySelector(".boot-splash-static");
  if (!splash) {
    return null;
  }
  const background = getComputedStyle(splash).backgroundColor;
  const context = document.createElement("canvas").getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return {
    theme: document.documentElement.dataset.theme ?? null,
    background,
    opaque: alpha === 255,
    backgroundLuminance: (red + green + blue) / 3,
  };
}

async function bootStaticSplash(session, { system, themeMode }) {
  await session.run(storeThemeMode, {
    key: THEME_MODE_STORAGE_KEY,
    value: themeMode,
  });
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: system }],
  });
  await session.send("Network.enable", {});
  await session.send("Network.setBlockedURLs", {
    urls: RENDERER_ENTRY_PATTERNS,
  });
  await session.reload();
  await session.waitUntil(
    () => document.querySelector(".boot-splash-static") !== null,
    null,
    UI_TIMEOUT_MS,
  );
  return session.run(readStaticSplash);
}

async function restoreApp(session, storedThemeMode) {
  await session.send("Network.setBlockedURLs", { urls: [] });
  await session.run(storeThemeMode, {
    key: THEME_MODE_STORAGE_KEY,
    value: storedThemeMode,
  });
  await clearColorScheme(session);
  await session.reload();
}

runScenario("boot-splash-theme", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    await emulateColorScheme(session, "light");
    return {
      storedThemeMode: await session.run(
        readStoredThemeMode,
        THEME_MODE_STORAGE_KEY,
      ),
    };
  },
  steps: [
    [
      "a dark app theme paints a dark splash on a light system",
      async ({ session }) => {
        const splash = await bootStaticSplash(session, {
          system: "light",
          themeMode: "dark",
        });
        check(
          splash?.theme === "dark" &&
            splash.opaque &&
            splash.backgroundLuminance < 64,
          "static splash follows the stored dark theme",
          splash,
        );
        return splash;
      },
    ],
    [
      "a light app theme paints a light splash on a dark system",
      async ({ session }) => {
        const splash = await bootStaticSplash(session, {
          system: "dark",
          themeMode: "light",
        });
        check(
          splash?.theme === "light" &&
            splash.opaque &&
            splash.backgroundLuminance > 192,
          "static splash follows the stored light theme",
          splash,
        );
        return splash;
      },
    ],
    [
      "the system theme mode follows the system appearance",
      async ({ session }) => {
        const splash = await bootStaticSplash(session, {
          system: "dark",
          themeMode: "system",
        });
        check(
          splash?.theme === "dark" &&
            splash.opaque &&
            splash.backgroundLuminance < 64,
          "static splash follows the dark system appearance",
          splash,
        );
        return splash;
      },
    ],
  ],
  teardown: async ({ session, storedThemeMode }) => {
    await restoreApp(session, storedThemeMode);
    return {};
  },
});
