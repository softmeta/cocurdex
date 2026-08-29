import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AppDropdownContent,
  AppDropdownItem,
  appDropdownContentClassName,
  appPopupContentWidthClassName,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui";

// Every app dropdown (model picker, settings, agent picker, git filter, ...)
// shares one content class, so the row-gap that separates an adjacent
// selected + hovered pair must live here, not on a single call site.
describe("appDropdownContentClassName", () => {
  it("spaces consecutive menuitems so highlighted rows do not merge", () => {
    expect(appDropdownContentClassName).toContain(
      "[&_[role=menuitem]:not(:first-child)]:mt-0.5",
    );
  });

  it("grows with labels instead of locking to the trigger width", () => {
    expect(appPopupContentWidthClassName).toContain("w-max");
    expect(appPopupContentWidthClassName).toContain(
      "min-w-[var(--anchor-width)]",
    );
    expect(appDropdownContentClassName).toContain("w-max");
  });

  it("carries the gap class on the rendered content for any consumer", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <AppDropdownContent>
          <DropdownMenuGroup>
            <AppDropdownItem selected>First</AppDropdownItem>
            <AppDropdownItem>Second</AppDropdownItem>
          </DropdownMenuGroup>
        </AppDropdownContent>
      </DropdownMenu>,
    );

    const content = screen.getByRole("menu");
    expect(content.className).toContain(
      "[&_[role=menuitem]:not(:first-child)]:mt-0.5",
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("keeps dropdown content above sticky table headers", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <AppDropdownContent>
          <AppDropdownItem>First</AppDropdownItem>
        </AppDropdownContent>
      </DropdownMenu>,
    );

    const content = screen.getByRole("menu");
    expect(content.className).toContain("relative");
    expect(content.className).toContain("z-50");
    expect(content.parentElement?.className).toContain("z-50");
  });
});
