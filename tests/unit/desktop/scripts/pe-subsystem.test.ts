import { withWindowsGuiSubsystem } from "@desktop/scripts/pe-subsystem.mjs";
import { describe, expect, it } from "vitest";

const PE_OFFSET = 0x80;
const SUBSYSTEM = PE_OFFSET + 24 + 68;

function executable(subsystem: number) {
  const bytes = Buffer.alloc(0x200);
  bytes.write("MZ", 0, "latin1");
  bytes.writeUInt32LE(PE_OFFSET, 0x3c);
  bytes.write("PE\0\0", PE_OFFSET, "latin1");
  bytes.writeUInt16LE(subsystem, SUBSYSTEM);
  return bytes;
}

describe("windowless daemon runtime", () => {
  it("marks a console executable as a GUI one and changes nothing else", () => {
    const console = executable(3);
    const windowless = withWindowsGuiSubsystem(console);

    expect(windowless.readUInt16LE(SUBSYSTEM)).toBe(2);
    expect(console.readUInt16LE(SUBSYSTEM)).toBe(3);
    windowless.writeUInt16LE(3, SUBSYSTEM);
    expect(windowless.equals(console)).toBe(true);
  });

  it("refuses files that are not Windows executables", () => {
    expect(() => withWindowsGuiSubsystem(Buffer.from("#!/bin/sh\n"))).toThrow(
      "MZ",
    );
    expect(() => withWindowsGuiSubsystem(executable(9))).toThrow("subsystem");
  });
});
