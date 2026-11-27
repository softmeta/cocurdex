import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RightPanelWindowActions } from "@/app/layout/app-shell/right-panel-window-actions";

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
