import { describeAppUpdateCheckDialog } from "@desktop/electron/updater/app-update-check-dialog";
import { createInitialAppUpdateState } from "@desktop/electron/updater/app-update-state";
import { describe, expect, it } from "vitest";

const copy = {
  actions: { install: "Update and Restart" },
  card: { later: "Later" },
  status: {
    checking: "Checking for updates…",
    downloading: "Downloading version {{version}}…",
    downloadingWithPercent: "Downloading version {{version}}… {{percent}}%",
    error: "Could not check for updates. Try again later.",
    ready: "Version {{version}} is downloaded and ready to install.",
    unsupported: "Automatic updates are available in the packaged app.",
    upToDate: "You're up to date.",
  },
};

function packagedState(
  status: "checking" | "downloading" | "error" | "idle" | "ready",
  extras: {
    availableVersion?: string | null;
  } = {},
) {
  return {
    ...createInitialAppUpdateState({
      currentVersion: "0.1.0",
      packaged: true,
    }),
    availableVersion: extras.availableVersion ?? null,
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
    expect(
      describeAppUpdateCheckDialog(
        {
          ...packagedState("downloading", { availableVersion: "1.2.3" }),
          downloadPercent: 42,
        },
        copy,
      ),
    ).toEqual({
      kind: "message",
      message: "Downloading version 1.2.3… 42%",
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
    expect(describeAppUpdateCheckDialog(packagedState("error"), copy)).toEqual({
      kind: "message",
      message: "Could not check for updates. Try again later.",
      type: "warning",
    });
    expect(describeAppUpdateCheckDialog(packagedState("idle"), copy)).toEqual({
      kind: "message",
      message: "You're up to date.",
      type: "info",
    });
  });
});
