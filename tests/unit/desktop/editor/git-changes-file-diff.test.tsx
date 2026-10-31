import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { GitChangeFileDiff } from "@/features/editor/git-changes-file-diff";
import {
  buildEntries,
  entryLanguage,
  type GitChangeEntry,
} from "@/features/editor/git-changes-model";

// Pierre's diff element is a custom element that adopts a constructable
// stylesheet; jsdom has the API surface but not the implementation.
beforeAll(() => {
  const proto = CSSStyleSheet.prototype as CSSStyleSheet & {
    replaceSync?: (css: string) => void;
    replace?: (css: string) => Promise<CSSStyleSheet>;
  };
  proto.replaceSync ??= function replaceSync() {};
  proto.replace ??= function replace(this: CSSStyleSheet) {
    return Promise.resolve(this);
  };
});

function entry(contents = "a\nb\nc\nd"): GitChangeEntry {
  const built = buildEntries([
    {
      path: "src/a.ts",
      changeType: "modified",
      oldContents: contents,
      newContents: contents.replace("b", "B"),
      omittedReason: null,
      stagedState: "unstaged",
    },
  ]);
  return built[0] as GitChangeEntry;
}

const noop = () => {};

function renderRow(
  state: "open" | "folded" | "deferred",
  reservedHeight?: number,
) {
  return render(
    <GitChangeFileDiff
      actionsEnabled
      diffStyle="unified"
      diffThemeType="dark"
      entry={entry()}
      expandUnchanged={false}
      onDiscard={noop}
      onOpenFile={noop}
      onStage={noop}
      onToggle={noop}
      onUnstage={noop}
      reservedHeight={reservedHeight}
      state={state}
      wrap={false}
    />,
  );
}

function withBodyHeight(height: number): () => void {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => height,
  });
  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
      return;
    }
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  };
}

function placeholderHeight(container: HTMLElement): number | null {
  const bars = container.querySelector(".bg-editor-tab-hover-bg");
  const block = bars?.parentElement;
  if (!block) return null;
  return Number.parseInt(block.style.height, 10);
}

describe("GitChangeFileDiff row states", () => {
  it("keeps a deferred row at its reserved height without mounting a diff", () => {
    const { container } = renderRow("deferred", 320);

    expect(container.querySelector("diffs-container")).toBeNull();
    expect(placeholderHeight(container)).toBe(320);
  });

  it("waits for the diff language before mounting, keeping the reservation", async () => {
    const { container } = renderRow("open", 320);

    await waitFor(() => {
      expect(container.querySelector("diffs-container")).not.toBeNull();
    });
    // jsdom reports no layout, so the body has no height and the reservation
    // has to stay: an unpainted body must never shrink the row.
    expect(placeholderHeight(container)).toBe(320);
  });

  it("drops the reservation once the open body reports height", async () => {
    const restore = withBodyHeight(300);
    try {
      const { container } = renderRow("open", 320);

      await waitFor(() => {
        expect(placeholderHeight(container)).toBeNull();
      });
      expect(container.querySelector("diffs-container")).not.toBeNull();
      expect(container.querySelector("div[style*='min-height']")).toBeNull();
    } finally {
      restore();
    }
  });

  it("renders no body for a folded row", () => {
    const { container } = renderRow("folded");

    expect(container.querySelector("diffs-container")).toBeNull();
    expect(placeholderHeight(container)).toBeNull();
  });
});

describe("entryLanguage", () => {
  it("reads the language pierre will need for a file", () => {
    expect(entryLanguage(entry())).toBe("typescript");
  });
});
