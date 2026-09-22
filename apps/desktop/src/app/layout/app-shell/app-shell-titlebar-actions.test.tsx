import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { AppShellTitlebarActions } from "./app-shell-titlebar-actions";

function renderActions(
  overrides: Partial<ComponentProps<typeof AppShellTitlebarActions>> = {},
) {
  return render(
    <AppShellTitlebarActions
      isChatDetached={false}
      isRightPanelMaximized={false}
      isRightPanelOpen
      onOpenSettings={() => {}}
      onToggleRightPanel={() => {}}
      onToggleRightPanelMaximize={() => {}}
      {...overrides}
    />,
  );
}

describe("AppShellTitlebarActions", () => {
  it("offers the chat-aware editor controls while chat is in this window", () => {
    renderActions();

    expect(
      screen.getByRole("button", { name: "Enter full screen" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close editor panel" }),
    ).toBeVisible();
  });

  it("reflects a maximized editor", () => {
    renderActions({ isRightPanelMaximized: true });

    expect(
      screen.getByRole("button", { name: "Exit full screen" }),
    ).toBeVisible();
  });

  it("hides the editor fullscreen toggle with the editor panel closed", () => {
    renderActions({ isRightPanelOpen: false });

    expect(
      screen.queryByRole("button", { name: "Enter full screen" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open editor panel" }),
    ).toBeVisible();
  });

  it("keeps only window chrome while chat lives in its own window", () => {
    renderActions({ isChatDetached: true, isRightPanelMaximized: true });

    expect(
      screen.queryByRole("button", { name: "Exit full screen" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Enter full screen" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open editor panel" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeVisible();
  });
});
