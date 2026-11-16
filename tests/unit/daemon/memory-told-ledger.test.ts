import { mergeToldItems } from "@cocurdex/daemon/internal/memory/told-ledger";
import { describe, expect, it } from "vitest";

describe("told ledger", () => {
  it("keeps the newest items and moves a re-told item to the end", () => {
    const merged = mergeToldItems(
      ["Release is v1.2", "Dentist is on Friday", "Standup moved to 10:00"],
      ["dentist is on friday", "Build is green"],
      3,
    );
    expect(merged).toEqual([
      "Standup moved to 10:00",
      "dentist is on friday",
      "Build is green",
    ]);
  });
});
