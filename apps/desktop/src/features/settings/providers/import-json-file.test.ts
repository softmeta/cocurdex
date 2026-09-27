import { describe, expect, it } from "vitest";
import { isJsonImportFile } from "./import-json-file";

describe("isJsonImportFile", () => {
  it("accepts json and text files", () => {
    expect(isJsonImportFile({ name: "models.json", type: "" })).toBe(true);
    expect(isJsonImportFile({ name: "blob", type: "application/json" })).toBe(
      true,
    );
    expect(isJsonImportFile({ name: "notes.txt", type: "text/plain" })).toBe(
      true,
    );
    expect(isJsonImportFile({ name: "photo.png", type: "image/png" })).toBe(
      false,
    );
  });
});
