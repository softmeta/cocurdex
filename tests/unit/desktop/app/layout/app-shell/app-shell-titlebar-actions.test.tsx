import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppShellTitlebarActions } from "@/app/layout/app-shell/app-shell-titlebar-actions";
import { RightPanelWindowActions } from "@/app/layout/app-shell/right-panel-window-actions";

function renderActions(
  overrides: Partial<ComponentProps<typeof AppShellTitlebarActions>> = {},
) {
  return render(
    <AppShellTitlebarActions
      isChatDetached={false}
      isRightPanelOpen
      onOpenSettings={() => {}}
      onToggleRightPanel={() => {}}
      {...overrides}
    />,
  );
}

describe("AppShellTitlebarActions", () => {
  it("toggles the editor panel while chat is in this window", () => {
    renderActions();

    expect(
      screen.getByRole("button", { name: "Close editor panel" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  it("offers to open a closed editor panel", () => {
    renderActions({ isRightPanelOpen: false });

    expect(
      screen.getByRole("button", { name: "Open editor panel" }),
    ).toBeVisible();
  });

  it("keeps only settings while chat lives in its own window", () => {
    renderActions({ isChatDetached: true });

    expect(
      screen.queryByRole("button", { name: "Open editor panel" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Close editor panel" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
  });
});

describe("RightPanelWindowActions", () => {
  it("offers fullscreen, docking, and closing for a side-by-side editor", () => {
    const onCloseRightPanel = vi.fn();
    render(
      <RightPanelWindowActions
        isRightPanelMaximized={false}
        onCloseRightPanel={onCloseRightPanel}
        onToggleRightPanelMaximize={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Enter full screen" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Close editor panel" }));
    expect(onCloseRightPanel).toHaveBeenCalledOnce();
  });

  it("offers exiting fullscreen and closing for a maximized editor", () => {
    render(
      <RightPanelWindowActions
        isRightPanelMaximized
        onCloseRightPanel={() => {}}
        onToggleRightPanelMaximize={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Exit full screen" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close editor panel" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
