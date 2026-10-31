import {
  type AppUpdateState,
  appUpdateEventForError,
  createInitialAppUpdateState,
  githubReleaseNotesUrl,
  isUpdateReadyPromptVisible,
  normalizeAppUpdateDownloadPercent,
  reduceAppUpdateState,
} from "@desktop/electron/updater/app-update-state";
import { describe, expect, it } from "vitest";

function packagedState(
  overrides: Partial<AppUpdateState> = {},
): AppUpdateState {
  return {
    ...createInitialAppUpdateState({
      currentVersion: "0.1.0",
      packaged: true,
    }),
    ...overrides,
  };
}

describe("createInitialAppUpdateState", () => {
  it("starts idle when packaged", () => {
    expect(
      createInitialAppUpdateState({
        currentVersion: "0.1.0",
        packaged: true,
      }),
    ).toEqual({
      availableVersion: null,
      channel: "stable",
      currentVersion: "0.1.0",
      dismissedVersion: null,
      downloadPercent: null,
      errorMessage: null,
      releaseNotesUrl: null,
      status: "idle",
    });
  });

  it("starts unsupported when unpackaged", () => {
    expect(
      createInitialAppUpdateState({
        currentVersion: "0.1.0",
        packaged: false,
      }).status,
    ).toBe("unsupported");
  });
});

describe("githubReleaseNotesUrl", () => {
  it("points at the tagged GitHub release", () => {
    expect(githubReleaseNotesUrl("0.2.0")).toBe(
      "https://github.com/softmeta/cocurdex/releases/tag/v0.2.0",
    );
  });
});

describe("normalizeAppUpdateDownloadPercent", () => {
  it("clamps, rounds, and treats non-finite values as 0", () => {
    expect(normalizeAppUpdateDownloadPercent(41.6)).toBe(42);
    expect(normalizeAppUpdateDownloadPercent(-4)).toBe(0);
    expect(normalizeAppUpdateDownloadPercent(140)).toBe(100);
    expect(normalizeAppUpdateDownloadPercent(Number.NaN)).toBe(0);
  });
});

describe("reduceAppUpdateState", () => {
  it("ignores every event while unsupported", () => {
    const unsupported = createInitialAppUpdateState({
      currentVersion: "0.1.0",
      packaged: false,
    });

    expect(
      reduceAppUpdateState(unsupported, {
        type: "downloaded",
        version: "0.2.0",
        releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
      }),
    ).toBe(unsupported);
  });

  it("walks check → download → ready", () => {
    let state = packagedState();
    state = reduceAppUpdateState(state, { type: "checking" });
    expect(state.status).toBe("checking");

    state = reduceAppUpdateState(state, {
      type: "available",
      version: "0.2.0",
      releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
    });
    expect(state).toMatchObject({
      availableVersion: "0.2.0",
      downloadPercent: 0,
      status: "downloading",
    });

    state = reduceAppUpdateState(state, { percent: 41.6, type: "progress" });
    expect(state).toMatchObject({
      downloadPercent: 42,
      status: "downloading",
    });

    const sameTick = reduceAppUpdateState(state, {
      percent: 42.2,
      type: "progress",
    });
    expect(sameTick).toBe(state);

    state = reduceAppUpdateState(state, {
      type: "downloaded",
      version: "0.2.0",
      releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
    });
    expect(state.status).toBe("ready");
    expect(state.downloadPercent).toBeNull();
    expect(isUpdateReadyPromptVisible(state)).toBe(true);
  });

  it("returns to idle when no update is available", () => {
    const state = reduceAppUpdateState(
      reduceAppUpdateState(packagedState(), { type: "checking" }),
      { type: "not-available" },
    );
    expect(state.status).toBe("idle");
    expect(state.availableVersion).toBeNull();
  });

  it("records a check error", () => {
    const state = reduceAppUpdateState(packagedState(), {
      type: "error",
      message: "net down",
    });
    expect(state).toMatchObject({
      errorMessage: "net down",
      status: "error",
    });
  });

  it("hides the ready prompt for the dismissed version only", () => {
    const ready = reduceAppUpdateState(packagedState(), {
      type: "downloaded",
      version: "0.2.0",
      releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
    });
    const dismissed = reduceAppUpdateState(ready, { type: "dismiss" });

    expect(isUpdateReadyPromptVisible(dismissed)).toBe(false);
    expect(dismissed.status).toBe("ready");
    expect(dismissed.dismissedVersion).toBe("0.2.0");

    const nextVersion = reduceAppUpdateState(dismissed, {
      type: "downloaded",
      version: "0.3.0",
      releaseNotesUrl: githubReleaseNotesUrl("0.3.0"),
    });
    expect(isUpdateReadyPromptVisible(nextVersion)).toBe(true);
  });

  it("does not leave ready when a later check runs", () => {
    const ready = reduceAppUpdateState(packagedState(), {
      type: "downloaded",
      version: "0.2.0",
      releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
    });

    expect(reduceAppUpdateState(ready, { type: "checking" })).toBe(ready);
    expect(
      reduceAppUpdateState(ready, {
        type: "available",
        version: "0.2.0",
        releaseNotesUrl: githubReleaseNotesUrl("0.2.0"),
      }),
    ).toBe(ready);
    expect(reduceAppUpdateState(ready, { percent: 50, type: "progress" })).toBe(
      ready,
    );
    expect(reduceAppUpdateState(ready, { type: "not-available" })).toBe(ready);
    expect(
      reduceAppUpdateState(ready, { type: "error", message: "later fail" }),
    ).toBe(ready);
  });

  it("keeps a channel change on unpackaged builds", () => {
    const unsupported = createInitialAppUpdateState({
      currentVersion: "0.1.0",
      packaged: false,
    });
    const next = reduceAppUpdateState(unsupported, {
      type: "set-channel",
      channel: "test",
    });
    expect(next).toMatchObject({
      channel: "test",
      status: "unsupported",
    });
  });

  it("clears a downloaded update when the channel changes", () => {
    const ready = reduceAppUpdateState(packagedState({ channel: "test" }), {
      type: "downloaded",
      version: "0.2.0-beta.1",
      releaseNotesUrl: githubReleaseNotesUrl("0.2.0-beta.1"),
    });
    const next = reduceAppUpdateState(ready, {
      type: "set-channel",
      channel: "stable",
    });
    expect(next).toMatchObject({
      availableVersion: null,
      channel: "stable",
      dismissedVersion: null,
      status: "idle",
    });
  });

  it("ignores a no-op channel change", () => {
    const state = packagedState();
    expect(
      reduceAppUpdateState(state, { type: "set-channel", channel: "stable" }),
    ).toBe(state);
  });
});

function updaterError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {});
}

describe("appUpdateEventForError", () => {
  it("treats a release whose update metadata is not uploaded yet as no update", () => {
    const error = updaterError(
      "Cannot find latest-mac.yml in the latest release artifacts",
      "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    );
    expect(appUpdateEventForError(error)).toEqual({ type: "not-available" });
  });

  it("reports other updater failures as errors", () => {
    const error = updaterError("net::ERR_INTERNET_DISCONNECTED");
    expect(appUpdateEventForError(error)).toEqual({
      type: "error",
      message: "net::ERR_INTERNET_DISCONNECTED",
    });
  });

  it("reports non-Error values as errors", () => {
    expect(appUpdateEventForError("boom")).toEqual({
      type: "error",
      message: "boom",
    });
  });

  it("leaves a checking state idle while a release is still publishing", () => {
    const checking = packagedState({ channel: "test", status: "checking" });
    const error = updaterError(
      "Cannot find beta-mac.yml",
      "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    );
    expect(
      reduceAppUpdateState(checking, appUpdateEventForError(error)),
    ).toMatchObject({ errorMessage: null, status: "idle" });
  });
});
