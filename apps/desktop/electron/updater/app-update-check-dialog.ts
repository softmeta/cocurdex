import type { AppUpdateState } from "./app-update-state";

export interface AppUpdateCopy {
  actions: {
    install: string;
  };
  card: {
    later: string;
  };
  status: {
    checking: string;
    downloading: string;
    error: string;
    ready: string;
    unsupported: string;
    upToDate: string;
  };
}

export type AppUpdateCheckDialog =
  | {
      kind: "message";
      message: string;
      type: "info" | "warning";
    }
  | {
      installLabel: string;
      kind: "ready";
      laterLabel: string;
      message: string;
    };

function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export function describeAppUpdateCheckDialog(
  state: AppUpdateState,
  copy: AppUpdateCopy,
): AppUpdateCheckDialog {
  const version = state.availableVersion ?? "";

  switch (state.status) {
    case "checking":
      return { kind: "message", message: copy.status.checking, type: "info" };
    case "downloading":
      return {
        kind: "message",
        message: fillTemplate(copy.status.downloading, { version }),
        type: "info",
      };
    case "ready":
      return {
        installLabel: copy.actions.install,
        kind: "ready",
        laterLabel: copy.card.later,
        message: fillTemplate(copy.status.ready, { version }),
      };
    case "error":
      return {
        kind: "message",
        message: fillTemplate(copy.status.error, {
          message: state.errorMessage ?? "",
        }),
        type: "warning",
      };
    case "unsupported":
      return {
        kind: "message",
        message: copy.status.unsupported,
        type: "info",
      };
    case "idle":
      return { kind: "message", message: copy.status.upToDate, type: "info" };
  }
}
