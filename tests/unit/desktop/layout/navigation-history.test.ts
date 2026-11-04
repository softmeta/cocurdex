import { describe, expect, it } from "vitest";
import {
  type AppLocation,
  canNavigate,
  currentLocation,
  EMPTY_HISTORY,
  MAX_HISTORY_ENTRIES,
  type NavigationHistory,
  recordLocation,
  replaceCurrentLocation,
  stepHistory,
} from "@/app/layout/navigation/navigation-history";

function at(
  sessionId: string | null,
  view: AppLocation["panel"]["view"] = "editor",
  entityId: string | null = null,
): AppLocation {
  return { sessionId, panel: { view, entityId } };
}

function recordAll(locations: AppLocation[]): NavigationHistory {
  return locations.reduce(recordLocation, EMPTY_HISTORY);
}

describe("navigation history", () => {
  it("walks back and forward across session and panel entities", () => {
    const note = at("s1", "notes", "n1");
    const issue = at("s1", "issues", "i1");
    const session = at("s2", "issues", "i1");
    let history = recordAll([note, issue, session]);

    history = stepHistory(history, "back") ?? history;
    expect(currentLocation(history)).toEqual(issue);
    history = stepHistory(history, "back") ?? history;
    expect(currentLocation(history)).toEqual(note);
    expect(canNavigate(history, "back")).toBe(false);
    expect(stepHistory(history, "back")).toBeNull();

    history = stepHistory(history, "forward") ?? history;
    expect(currentLocation(history)).toEqual(issue);
  });

  it("ignores a location equal to the current entry", () => {
    const history = recordAll([at("s1"), at("s1")]);
    expect(history.entries).toHaveLength(1);
  });

  it("drops the forward entries when navigating somewhere new", () => {
    let history = recordAll([at("s1"), at("s2"), at("s3")]);
    history = stepHistory(history, "back") ?? history;
    history = recordLocation(history, at("s4"));
    expect(history.entries.map((entry) => entry.sessionId)).toEqual([
      "s1",
      "s2",
      "s4",
    ]);
    expect(canNavigate(history, "forward")).toBe(false);
  });

  it("keeps only the newest entries", () => {
    const history = recordAll(
      Array.from({ length: MAX_HISTORY_ENTRIES + 5 }, (_, index) =>
        at(`s${index}`),
      ),
    );
    expect(history.entries).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(currentLocation(history)?.sessionId).toBe(
      `s${MAX_HISTORY_ENTRIES + 4}`,
    );
  });

  it("replaces the current entry without touching forward entries", () => {
    let history = recordAll([at("s1"), at("s2"), at("s3")]);
    history = stepHistory(history, "back") ?? history;
    history = replaceCurrentLocation(history, at("s2", "notes", "n1"));
    expect(currentLocation(history)).toEqual(at("s2", "notes", "n1"));
    expect(canNavigate(history, "forward")).toBe(true);
  });
});
