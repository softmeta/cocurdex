import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSyncGitChangesTreeSelection } from "@/features/editor/git-changes-tree-sync";

type FileTreeModel = Parameters<typeof useSyncGitChangesTreeSelection>[0];

function createFakeTreeModel(paths: string[]) {
  const selected = new Set<string>();
  const listeners = new Set<() => void>();
  let focused: string | null = null;
  const emit = () => {
    for (const listener of listeners) listener();
  };

  const handle = (path: string) => ({
    isSelected: () => selected.has(path),
    select: () => {
      selected.add(path);
      emit();
    },
    deselect: () => {
      selected.delete(path);
      emit();
    },
  });

  const model = {
    getSelectedPaths: () => [...selected],
    getFocusedPath: () => focused,
    focusPath: (path: string) => {
      focused = path;
      emit();
    },
    getItem: (path: string) => (paths.includes(path) ? handle(path) : null),
    getFileTreeContainer: () => undefined,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    model: model as unknown as FileTreeModel,
    selected: () => [...selected],
    focused: () => focused,
  };
}

describe("useSyncGitChangesTreeSelection", () => {
  it("selects the diff's file in the tree, not only its focus", async () => {
    const tree = createFakeTreeModel(["cocurdex/a.ts", "cocurdex/b.ts"]);

    renderHook(() =>
      useSyncGitChangesTreeSelection(tree.model, "cocurdex/b.ts"),
    );

    await waitFor(() => expect(tree.selected()).toEqual(["cocurdex/b.ts"]));
    expect(tree.focused()).toBe("cocurdex/b.ts");
  });

  it("moves the selection instead of adding to it", async () => {
    const tree = createFakeTreeModel(["cocurdex/a.ts", "cocurdex/b.ts"]);

    const { rerender } = renderHook(
      ({ path }: { path: string }) =>
        useSyncGitChangesTreeSelection(tree.model, path),
      { initialProps: { path: "cocurdex/a.ts" } },
    );
    await waitFor(() => expect(tree.selected()).toEqual(["cocurdex/a.ts"]));

    rerender({ path: "cocurdex/b.ts" });

    await waitFor(() => expect(tree.selected()).toEqual(["cocurdex/b.ts"]));
    expect(tree.focused()).toBe("cocurdex/b.ts");
  });

  it("drops a stale selection when the file leaves the change set", async () => {
    const tree = createFakeTreeModel(["cocurdex/a.ts", "cocurdex/b.ts"]);

    const { rerender } = renderHook(
      ({ path }: { path: string | null }) =>
        useSyncGitChangesTreeSelection(tree.model, path),
      { initialProps: { path: "cocurdex/b.ts" as string | null } },
    );
    await waitFor(() => expect(tree.selected()).toEqual(["cocurdex/b.ts"]));

    rerender({ path: null });

    expect(tree.selected()).toEqual(["cocurdex/b.ts"]);
  });
});
