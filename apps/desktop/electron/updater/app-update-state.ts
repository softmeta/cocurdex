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
  | { type: "progress" };

export const APP_UPDATE_GITHUB_REPO = "softmeta/cocurdex";

export function createInitialAppUpdateState(input: {
  currentVersion: string;
  packaged: boolean;
}): AppUpdateState {
  return {
    availableVersion: null,
    currentVersion: input.currentVersion,
    dismissedVersion: null,
    errorMessage: null,
    releaseNotesUrl: null,
    status: input.packaged ? "idle" : "unsupported",
  };
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
        errorMessage: null,
        releaseNotesUrl: event.releaseNotesUrl,
        status: "downloading",
      };
    case "progress":
      if (state.status === "ready") {
        return state;
      }
      return {
        ...state,
        status: "downloading",
      };
    case "downloaded":
      return {
        ...state,
        availableVersion: event.version,
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
