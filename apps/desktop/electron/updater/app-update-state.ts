export type AppUpdateStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "ready"
  | "unsupported";

export interface AppUpdateState {
  availableVersion: string | null;
  currentVersion: string;
  dismissedVersion: string | null;
  downloadPercent: number | null;
  errorMessage: string | null;
  releaseNotesUrl: string | null;
  status: AppUpdateStatus;
}

export type AppUpdateEvent =
  | {
      releaseNotesUrl: string | null;
      type: "available";
      version: string;
    }
  | {
      releaseNotesUrl: string | null;
      type: "downloaded";
      version: string;
    }
  | { message: string; type: "error" }
  | { type: "checking" }
  | { type: "dismiss" }
  | { type: "not-available" }
  | { percent: number; type: "progress" };

export const APP_UPDATE_GITHUB_REPO = "softmeta/cocurdex";

export function createInitialAppUpdateState(input: {
  currentVersion: string;
  packaged: boolean;
}): AppUpdateState {
  return {
    availableVersion: null,
    currentVersion: input.currentVersion,
    dismissedVersion: null,
    downloadPercent: null,
    errorMessage: null,
    releaseNotesUrl: null,
    status: input.packaged ? "idle" : "unsupported",
  };
}

export function normalizeAppUpdateDownloadPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function githubReleaseNotesUrl(version: string): string {
  return `https://github.com/${APP_UPDATE_GITHUB_REPO}/releases/tag/v${version}`;
}

export function isUpdateReadyPromptVisible(state: AppUpdateState): boolean {
  return (
    state.status === "ready" &&
    state.availableVersion !== null &&
    state.dismissedVersion !== state.availableVersion
  );
}

export function reduceAppUpdateState(
  state: AppUpdateState,
  event: AppUpdateEvent,
): AppUpdateState {
  if (state.status === "unsupported") {
    return state;
  }

  switch (event.type) {
    case "checking":
      if (state.status === "ready") {
        return state;
      }
      return {
        ...state,
        downloadPercent: null,
        errorMessage: null,
        status: "checking",
      };
    case "available":
      if (state.status === "ready") {
        return state;
      }
      return {
        ...state,
        availableVersion: event.version,
        downloadPercent: 0,
        errorMessage: null,
        releaseNotesUrl: event.releaseNotesUrl,
        status: "downloading",
      };
    case "progress": {
      if (state.status === "ready") {
        return state;
      }
      const downloadPercent = normalizeAppUpdateDownloadPercent(event.percent);
      if (
        state.status === "downloading" &&
        state.downloadPercent === downloadPercent
      ) {
        return state;
      }
      return {
        ...state,
        downloadPercent,
        status: "downloading",
      };
    }
    case "downloaded":
      return {
        ...state,
        availableVersion: event.version,
        downloadPercent: null,
        errorMessage: null,
        releaseNotesUrl: event.releaseNotesUrl,
        status: "ready",
      };
    case "not-available":
      if (state.status === "ready") {
        return state;
      }
      return {
        ...state,
        availableVersion: null,
        downloadPercent: null,
        errorMessage: null,
        releaseNotesUrl: null,
        status: "idle",
      };
    case "error":
      if (state.status === "ready") {
        return state;
      }
      return {
        ...state,
        downloadPercent: null,
        errorMessage: event.message,
        status: "error",
      };
    case "dismiss":
      return {
        ...state,
        dismissedVersion: state.availableVersion,
      };
  }
}
