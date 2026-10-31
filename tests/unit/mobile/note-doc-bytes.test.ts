import {
  decodeNoteDocBytes,
  encodeNoteDocBytes,
} from "@cocurdex/mobile/internal/notes/editor/note-doc-bytes";
import * as daemonBytes from "@cocurdex/note-doc/bytes";
import { afterEach, describe, expect, it, vi } from "vitest";

const bytes = Uint8Array.from(
  { length: 300 },
  (_, index) => (index * 37) % 256,
);

describe("note doc bytes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes like the daemon without Buffer", () => {
    const expected = daemonBytes.encodeNoteDocBytes(bytes);
    vi.stubGlobal("Buffer", undefined);

    const encoded = encodeNoteDocBytes(bytes);

    expect(encoded).toBe(expected);
    expect(decodeNoteDocBytes(encoded)).toEqual(bytes);
  });
});
