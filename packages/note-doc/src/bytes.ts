import { fromBase64, toBase64 } from "lib0/buffer";

export function encodeNoteDocBytes(bytes: Uint8Array): string {
  return toBase64(bytes);
}

export function decodeNoteDocBytes(encoded: string): Uint8Array {
  return fromBase64(encoded);
}
