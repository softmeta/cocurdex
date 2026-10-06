import { describe, expect, it } from "vitest";
import { titleBarChromeOptions, titleBarOverlayFor } from "./title-bar-chrome";

describe("titleBarChromeOptions", () => {
  it("keeps the inset traffic lights on macOS", () => {
    expect(titleBarChromeOptions("darwin", "#0f0f11")).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 12, y: 9 },
    });
  });

  it("uses a themed window controls overlay on Windows and Linux", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(titleBarChromeOptions(platform, "#ffffff")).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#ffffff",
          symbolColor: "#3f3f46",
          height: 32,
        },
      });
    }
  });
});

describe("titleBarOverlayFor", () => {
  it("picks light window control symbols on dark surfaces", () => {
    expect(titleBarOverlayFor("#0f0f11").symbolColor).toBe("#e4e4e7");
  });
});
