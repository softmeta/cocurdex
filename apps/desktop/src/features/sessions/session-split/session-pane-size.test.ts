import { describe, expect, it } from "vitest";
import {
  canSplitPane,
  MIN_SESSION_PANE_HEIGHT_PX,
  MIN_SESSION_PANE_WIDTH_PX,
  minSessionPaneSize,
  SESSION_SPLIT_SEPARATOR_PX,
  type SessionPaneSize,
} from "./session-pane-size";
import {
  createRootPane,
  ROOT_PANE_ID,
  type SessionSplitNode,
  splitPane,
} from "./session-split-tree";

function createIds(labels: string[]) {
  let index = 0;
  return () => {
    const label = labels[index];
    index += 1;
    return label ?? `id-${index}`;
  };
}

function split(
  node: SessionSplitNode,
  paneId: string,
  direction: "right" | "down",
  ids: string[],
): SessionSplitNode {
  const result = splitPane(node, paneId, direction, {
    createId: createIds(ids),
  });
  if (!result) {
    throw new Error("split failed");
  }
  return result.root;
}

function paneSize(width: number, height: number): SessionPaneSize {
  return { width, height };
}

const singlePane: SessionPaneSize = {
  width: MIN_SESSION_PANE_WIDTH_PX,
  height: MIN_SESSION_PANE_HEIGHT_PX,
};

describe("session pane size", () => {
  it("floors a lone pane at the minimum size", () => {
    expect(minSessionPaneSize(createRootPane())).toEqual(singlePane);
  });

  it("adds both sides of a side-by-side split", () => {
    const root = split(createRootPane(), ROOT_PANE_ID, "right", [
      "pane-b",
      "split-1",
    ]);

    expect(minSessionPaneSize(root)).toEqual({
      width: MIN_SESSION_PANE_WIDTH_PX * 2 + SESSION_SPLIT_SEPARATOR_PX,
      height: MIN_SESSION_PANE_HEIGHT_PX,
    });
  });

  it("stacks both sides of a split down", () => {
    const root = split(createRootPane(), ROOT_PANE_ID, "down", [
      "pane-b",
      "split-1",
    ]);

    expect(minSessionPaneSize(root)).toEqual({
      width: MIN_SESSION_PANE_WIDTH_PX,
      height: MIN_SESSION_PANE_HEIGHT_PX * 2 + SESSION_SPLIT_SEPARATOR_PX,
    });
  });

  it("carries nested columns and rows through their ancestors", () => {
    const columns = split(createRootPane(), ROOT_PANE_ID, "right", [
      "pane-b",
      "split-1",
    ]);
    const nested = split(columns, "pane-b", "right", ["pane-c", "split-2"]);
    const stacked = split(nested, "pane-c", "down", ["pane-d", "split-3"]);

    expect(minSessionPaneSize(stacked)).toEqual({
      width: MIN_SESSION_PANE_WIDTH_PX * 3 + SESSION_SPLIT_SEPARATOR_PX * 2,
      height: MIN_SESSION_PANE_HEIGHT_PX * 2 + SESSION_SPLIT_SEPARATOR_PX,
    });
  });

  it("allows a split only when two panes fit on that axis", () => {
    const widthThreshold =
      MIN_SESSION_PANE_WIDTH_PX * 2 + SESSION_SPLIT_SEPARATOR_PX;
    const heightThreshold =
      MIN_SESSION_PANE_HEIGHT_PX * 2 + SESSION_SPLIT_SEPARATOR_PX;

    expect(canSplitPane(paneSize(widthThreshold, 1), "right")).toBe(true);
    expect(canSplitPane(paneSize(widthThreshold - 1, 1), "right")).toBe(false);
    expect(canSplitPane(paneSize(1, heightThreshold), "down")).toBe(true);
    expect(canSplitPane(paneSize(1, heightThreshold - 1), "down")).toBe(false);
    expect(canSplitPane(singlePane, "right")).toBe(false);
    expect(canSplitPane(singlePane, "down")).toBe(false);
  });

  it("does not block a pane whose size has not been measured yet", () => {
    expect(canSplitPane(undefined, "right")).toBe(true);
    expect(canSplitPane(undefined, "down")).toBe(true);
  });
});
