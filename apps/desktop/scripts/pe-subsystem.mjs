const PE_HEADER_OFFSET = 0x3c;
const PE_SIGNATURE = 0x00004550;
const OPTIONAL_HEADER_OFFSET = 24;
const SUBSYSTEM_OFFSET = 68;
const SUBSYSTEM_WINDOWS_GUI = 2;
const SUBSYSTEM_WINDOWS_CUI = 3;

export function withWindowsGuiSubsystem(executable) {
  const bytes = Buffer.from(executable);
  if (bytes.readUInt16LE(0) !== 0x5a4d) {
    throw new Error("Not a Windows executable: missing MZ header");
  }
  const peOffset = bytes.readUInt32LE(PE_HEADER_OFFSET);
  if (bytes.readUInt32LE(peOffset) !== PE_SIGNATURE) {
    throw new Error("Not a Windows executable: missing PE signature");
  }
  const subsystemOffset = peOffset + OPTIONAL_HEADER_OFFSET + SUBSYSTEM_OFFSET;
  const subsystem = bytes.readUInt16LE(subsystemOffset);
  if (
    subsystem !== SUBSYSTEM_WINDOWS_CUI &&
    subsystem !== SUBSYSTEM_WINDOWS_GUI
  ) {
    throw new Error(`Unexpected PE subsystem ${subsystem}`);
  }
  bytes.writeUInt16LE(SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
  return bytes;
}
