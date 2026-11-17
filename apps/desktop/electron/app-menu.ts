import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import enCommon from "@/locales/en-US/common.json";
import enSettings from "@/locales/en-US/settings.json";
import zhCommon from "@/locales/zh-CN/common.json";
import zhSettings from "@/locales/zh-CN/settings.json";
import { exportAppDiagnostics } from "./logging";
import { describeAppUpdateCheckDialog } from "./updater/app-update-check-dialog";
import { checkForAppUpdate, installAppUpdate } from "./updater/app-updater";

function updatesCopy() {
  const locale = app.getLocale().toLowerCase();
  return locale.startsWith("zh") ? zhSettings.updates : enSettings.updates;
}

function diagnosticsCopy() {
  const locale = app.getLocale().toLowerCase();
  return locale.startsWith("zh")
    ? zhSettings.diagnostics
    : enSettings.diagnostics;
}

function findCopy() {
  const locale = app.getLocale().toLowerCase();
  return locale.startsWith("zh") ? zhCommon.find : enCommon.find;
}

function editMenu(
  platform: NodeJS.Platform,
  onFind: () => void,
): MenuItemConstructorOptions {
  const isMac = platform === "darwin";
  return {
    role: "editMenu",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" as const },
            { role: "delete" as const },
            { role: "selectAll" as const },
          ]
        : [
            { role: "delete" as const },
            { type: "separator" as const },
            { role: "selectAll" as const },
          ]),
      { type: "separator" },
      {
        label: findCopy().menu,
        accelerator: "CmdOrCtrl+F",
        registerAccelerator: false,
        click: onFind,
      },
    ],
  };
}

function requestFindInFocusedWindow() {
  BrowserWindow.getFocusedWindow()?.webContents.send("app:findRequested");
}

async function handleExportDiagnostics() {
  try {
    const { outputPath } = await exportAppDiagnostics();
    shell.showItemInFolder(outputPath);
  } catch (error) {
    dialog.showErrorBox(
      diagnosticsCopy().actions.export,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function showUpdateDialog(
  dialogSpec: ReturnType<typeof describeAppUpdateCheckDialog>,
) {
  const parent = BrowserWindow.getFocusedWindow();
  const options =
    dialogSpec.kind === "ready"
      ? {
          buttons: [dialogSpec.laterLabel, dialogSpec.installLabel],
          cancelId: 0,
          defaultId: 1,
          message: dialogSpec.message,
          type: "info" as const,
        }
      : {
          message: dialogSpec.message,
          type: dialogSpec.type,
        };

  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);

  if (dialogSpec.kind === "ready" && result.response === 1) {
    installAppUpdate();
  }
}

async function handleCheckForUpdates() {
  const state = await checkForAppUpdate();
  await showUpdateDialog(describeAppUpdateCheckDialog(state, updatesCopy()));
}

export function registerApplicationMenu() {
  const checkItem = {
    click: () => {
      void handleCheckForUpdates();
    },
    label: updatesCopy().actions.check,
  };
  const exportItem = {
    click: () => {
      void handleExportDiagnostics();
    },
    label: diagnosticsCopy().actions.export,
  };
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              checkItem,
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    { role: "fileMenu" },
    editMenu(process.platform, requestFindInFocusedWindow),
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help" as const,
      submenu: [
        ...(isMac ? [] : [checkItem, { type: "separator" as const }]),
        exportItem,
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
