import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GitChangesFileList } from "@/features/editor/git-changes-file-list";
import {
  buildEntries,
  type GitChangeEntry,
} from "@/features/editor/git-changes-model";

function changedFiles(): GitChangeEntry[] {
  return buildEntries([
    {
      path: "src/a.ts",
      changeType: "modified",
      oldContents: "a\n",
      newContents: "b\n",
      omittedReason: null,
      stagedState: "unstaged",
    },
    {
      path: "src/nested/b.ts",
      changeType: "added",
      oldContents: "",
      newContents: "b\n",
      omittedReason: null,
      stagedState: "unstaged",
    },
  ]);
}

function renderList(selectedPath: string | null, onSelect = () => {}) {
  return render(
    <GitChangesFileList
      entries={changedFiles()}
      onSelect={onSelect}
      selectedPath={selectedPath}
    />,
  );
}

describe("GitChangesFileList", () => {
  it("shows every changed file as its directory plus name", () => {
    renderList(null);

    expect(screen.getByText("src/")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();
    expect(screen.getByText("src/nested/")).toBeTruthy();
    expect(screen.getByText("b.ts")).toBeTruthy();
  });

  it("reveals the picked file", () => {
    const onSelect = vi.fn();
    renderList(null, onSelect);

    fireEvent.click(screen.getByText("b.ts"));

    expect(onSelect).toHaveBeenCalledWith("src/nested/b.ts");
  });

  it("marks only the file the diff stack is showing", () => {
    renderList("src/a.ts");

    const selected = screen.getByText("a.ts").closest("button");
    const other = screen.getByText("b.ts").closest("button");

    expect(selected?.getAttribute("aria-current")).toBe("true");
    expect(other?.getAttribute("aria-current")).toBeNull();
  });

  it("states each file's change as git's letter instead of line counts", () => {
    renderList(null);

    expect(screen.getByText("M").getAttribute("title")).toBe("Modified");
    expect(screen.getByText("A").getAttribute("title")).toBe("Added");
    expect(screen.queryByText("+3")).toBeNull();
  });
});
