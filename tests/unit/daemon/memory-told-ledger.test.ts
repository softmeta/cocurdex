import {
  mergeToldItems,
  parseToldLedgerBody,
  removeToldItem,
  renderToldLedgerBody,
} from "@cocurdex/daemon/internal/memory/told-ledger";
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

  it("survives a round trip through the stored body, including user edits around it", () => {
    const items = mergeToldItems([], ["  Flight   lands at 18:05 ", ""]);
    const body = `${renderToldLedgerBody(items)}\n\nnote added by hand`;
    expect(parseToldLedgerBody(body.replace(/\n/g, "\r\n"))).toEqual([
      "Flight lands at 18:05",
    ]);
    expect(removeToldItem(items, "flight lands at 18:05")).toEqual([]);
  });
});
