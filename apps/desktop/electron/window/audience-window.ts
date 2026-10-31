import {
  app,
  BrowserWindow,
  type IpcMain,
  type IpcMainInvokeEvent,
  screen,
} from "electron";
import { registerHandler, schemas } from "../ipc";
import { denyWindowNavigation, resolveMainWindowDevTools } from "../security";
import { audienceWindowPlacement } from "./audience-placement";
import { rendererPageUrl } from "./renderer-page";

const AUDIENCE_BACKGROUND = "#000000";

let audienceWindow: BrowserWindow | null = null;
let audienceChannel: string | null = null;

function presenterDisplayId(event: IpcMainInvokeEvent): number {
  const presenter = BrowserWindow.fromWebContents(event.sender);
  const display = presenter
    ? screen.getDisplayMatching(presenter.getBounds())
    : screen.getPrimaryDisplay();
  return display.id;
}

const usesSimpleFullScreen = process.platform === "darwin";

function enterAudienceFullScreen(window: BrowserWindow) {
  if (usesSimpleFullScreen) window.setSimpleFullScreen(true);
  else window.setFullScreen(true);
}

function leaveSimpleFullScreen(window: BrowserWindow) {
  if (usesSimpleFullScreen && window.isSimpleFullScreen())
    window.setSimpleFullScreen(false);
}

function destroyAudienceWindow(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  leaveSimpleFullScreen(window);
  window.destroy();
}

async function openAudienceWindow(
  preloadPath: string,
  event: IpcMainInvokeEvent,
  channel: string,
) {
  if (audienceWindow) destroyAudienceWindow(audienceWindow);
  const placement = audienceWindowPlacement(
    screen.getAllDisplays(),
    presenterDisplayId(event),
  );
  const window = new BrowserWindow({
    ...placement.bounds,
    show: false,
    title: "Cocurdex Presentation",
    backgroundColor: AUDIENCE_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      backgroundThrottling: false,
      devTools: resolveMainWindowDevTools({ packaged: app.isPackaged }),
    },
  });
  audienceWindow = window;
  audienceChannel = channel;
  window.on("close", () => leaveSimpleFullScreen(window));
  window.on("closed", () => {
    if (audienceWindow !== window) return;
    audienceWindow = null;
    audienceChannel = null;
  });
  denyWindowNavigation(window.webContents);
  window.once("ready-to-show", () => {
    window.showInactive();
    if (placement.fullscreen) enterAudienceFullScreen(window);
  });
  await window.loadURL(rendererPageUrl({ window: "deck-audience", channel }));
  return { opened: true, externalDisplay: placement.fullscreen };
}

function closeAudienceWindow(channel: string) {
  if (audienceChannel === channel && audienceWindow)
    destroyAudienceWindow(audienceWindow);
}

export function registerAudienceWindowHandlers(
  ipc: IpcMain,
  options: { preloadPath: string },
) {
  registerHandler(
    ipc,
    "presentation:openAudienceWindow",
    schemas.audienceWindow,
    (event, request) =>
      openAudienceWindow(options.preloadPath, event, request.channel),
  );
  registerHandler(
    ipc,
    "presentation:closeAudienceWindow",
    schemas.audienceWindow,
    (_event, request) => closeAudienceWindow(request.channel),
  );
}
