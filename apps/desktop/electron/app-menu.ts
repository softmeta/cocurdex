import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import enSettings from "@/locales/en-US/settings.json";
import zhSettings from "@/locales/zh-CN/settings.json";
import { exportDiagnostics, listCrashDumps } from "./logging";
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

async function handleExportDiagnostics() {
  try {
    const { outputPath } = await exportDiagnostics({
      crashReports: await listCrashDumps(app.getPath("crashDumps")),
    });
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
    { role: "editMenu" },
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
