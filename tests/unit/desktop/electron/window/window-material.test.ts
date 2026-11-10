import {
  windowMaterialFor,
  windowMaterialOptions,
} from "@desktop/electron/window/window-material";
import { describe, expect, it } from "vitest";

describe("windowMaterialFor", () => {
  it("uses the sidebar vibrancy on every macOS version", () => {
    expect(windowMaterialFor("darwin", "15.4.0")).toBe("vibrancy");
  });

  it("uses Mica from Windows 11 22H2 on", () => {
    expect(windowMaterialFor("win32", "10.0.22621")).toBe("mica");
    expect(windowMaterialFor("win32", "10.0.26100")).toBe("mica");
  });

  it("keeps a solid window on older Windows builds and Linux", () => {
    expect(windowMaterialFor("win32", "10.0.22000")).toBeNull();
    expect(windowMaterialFor("win32", "10.0.19045")).toBeNull();
    expect(windowMaterialFor("win32", "")).toBeNull();
    expect(windowMaterialFor("linux", "6.8.0")).toBeNull();
  });
});

describe("windowMaterialOptions", () => {
  it("makes the window transparent only when a material draws behind it", () => {
    expect(windowMaterialOptions("vibrancy")).toEqual({
      backgroundColor: "#00000000",
      vibrancy: "sidebar",
    });
    expect(windowMaterialOptions("mica")).toEqual({
      backgroundColor: "#00000000",
      backgroundMaterial: "mica",
    });
    expect(windowMaterialOptions(null)).toEqual({});
  });
});
