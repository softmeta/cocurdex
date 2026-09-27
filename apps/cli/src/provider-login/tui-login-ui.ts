import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProviderAuthPrompt } from "@cocurdex/shared";
import {
  type ProviderLoginUi,
  resolveSelectAnswer,
} from "./run-provider-login";

type SelectPrompt = Extract<ProviderAuthPrompt, { type: "select" }>;

function usePackagedPiAssets() {
  const packagedPiDir = fileURLToPath(new URL("./pi-package", import.meta.url));
  if (!process.env.PI_PACKAGE_DIR && existsSync(packagedPiDir)) {
    process.env.PI_PACKAGE_DIR = packagedPiDir;
  }
}

export async function createTuiLoginUi(providerId: string, title: string) {
  const [
    { LoginDialogComponent, initTheme },
    { ProcessTerminal, TuiMainScreen },
  ] = await Promise.all([
    import("@earendil-works/pi-coding-agent"),
    import("@earendil-works/pi-tui"),
  ]);
  usePackagedPiAssets();
  initTheme();
  const tui = new TuiMainScreen(new ProcessTerminal());
  const dialog = new LoginDialogComponent(tui, providerId, () => {}, title);
  tui.addChild(dialog);
  tui.setFocus(dialog);
  tui.start();

  async function askSelect(prompt: SelectPrompt) {
    const lines = prompt.options.map((option, index) => {
      const description = option.description ? ` - ${option.description}` : "";
      return `${index + 1}. ${option.label}${description}`;
    });
    dialog.showInfo([prompt.message, ...lines].join("\n"));
    const answer = await dialog.showPrompt("Choose a number");
    return resolveSelectAnswer(prompt, answer.trim());
  }

  const ui: ProviderLoginUi & { close(): void } = {
    signal: dialog.signal,
    showAuthUrl(url, instructions) {
      dialog.showAuth(url, instructions ?? undefined);
    },
    showDeviceCode(userCode, verificationUri) {
      dialog.showDeviceCode({ userCode, verificationUri });
      dialog.showWaiting("Waiting for authentication...");
    },
    showMessage(message) {
      dialog.showProgress(message);
    },
    async prompt(prompt) {
      if (prompt.type === "select") return askSelect(prompt);
      if (prompt.type === "manual_code") {
        return dialog.showManualInput(prompt.message);
      }
      return dialog.showPrompt(prompt.message, prompt.placeholder ?? undefined);
    },
    dismissPrompt() {
      dialog.showProgress("Continuing without manual input...");
    },
    close() {
      tui.stop();
    },
  };
  return ui;
}
