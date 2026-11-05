import {
  BRIEF_AWAY_MS,
  type Brief,
  briefDue,
  briefEntryAfterAway,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const brief = { updatedAt: "2026-11-05T09:00:00.000Z" } as Brief;

describe("brief presentation", () => {
  it("shows a brief only when it has content the user has not seen", () => {
    expect(briefDue(brief, null)).toBe(true);
    expect(briefDue(null, null)).toBe(false);
    expect(briefDue(brief, "2026-11-05T08:00:00.000Z")).toBe(true);
    expect(briefDue(brief, brief.updatedAt)).toBe(false);
  });

  it("counts a return as a new entry only after three hours away", () => {
    expect(briefEntryAfterAway(BRIEF_AWAY_MS)).toBe(true);
    expect(briefEntryAfterAway(BRIEF_AWAY_MS - 1)).toBe(false);
  });
});
