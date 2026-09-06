import { describe, expect, it } from "vitest";
import {
  type AppUpdateState,
  createInitialAppUpdateState,
  githubReleaseNotesUrl,
  isUpdateReadyPromptVisible,
  normalizeAppUpdateDownloadPercent,
  reduceAppUpdateState,
} from "./app-update-state";

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
});
