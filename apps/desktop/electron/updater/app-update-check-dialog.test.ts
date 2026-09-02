import { describe, expect, it } from "vitest";
import { describeAppUpdateCheckDialog } from "./app-update-check-dialog";
import { createInitialAppUpdateState } from "./app-update-state";

const copy = {
  actions: { install: "Update and Restart" },
  card: { later: "Later" },
  status: {
    checking: "Checking for updates…",
    downloading: "Downloading version {{version}}…",
    error: "Could not check for updates. {{message}}",
    ready: "Version {{version}} is downloaded and ready to install.",
    unsupported: "Automatic updates are available in the packaged app.",
    upToDate: "You're up to date.",
  },
};

function packagedState(
  status: "checking" | "downloading" | "error" | "idle" | "ready",
  extras: {
    availableVersion?: string | null;
    errorMessage?: string | null;
  } = {},
) {
  return {
    ...createInitialAppUpdateState({
      currentVersion: "0.1.0",
      packaged: true,
    }),
    availableVersion: extras.availableVersion ?? null,
    errorMessage: extras.errorMessage ?? null,
    status,
  };
}

describe("describeAppUpdateCheckDialog", () => {
  it("explains a check that is still in flight", () => {
    expect(
      describeAppUpdateCheckDialog(packagedState("checking"), copy),
    ).toEqual({
      kind: "message",
      message: "Checking for updates…",
      type: "info",
    });
  });

  it("explains that a found update is downloading", () => {
    expect(
      describeAppUpdateCheckDialog(
        packagedState("downloading", { availableVersion: "1.2.3" }),
        copy,
      ),
    ).toEqual({
      kind: "message",
      message: "Downloading version 1.2.3…",
      type: "info",
    });
  });

  it("offers to install a downloaded update", () => {
    expect(
      describeAppUpdateCheckDialog(
        packagedState("ready", { availableVersion: "1.2.3" }),
        copy,
      ),
    ).toEqual({
      installLabel: "Update and Restart",
      kind: "ready",
      laterLabel: "Later",
      message: "Version 1.2.3 is downloaded and ready to install.",
    });
  });

  it("keeps error and idle copy for the same dialog path", () => {
    expect(
      describeAppUpdateCheckDialog(
        packagedState("error", { errorMessage: "offline" }),
        copy,
      ),
    ).toEqual({
      kind: "message",
      message: "Could not check for updates. offline",
      type: "warning",
    });
    expect(describeAppUpdateCheckDialog(packagedState("idle"), copy)).toEqual({
      kind: "message",
      message: "You're up to date.",
      type: "info",
    });
  });
});
