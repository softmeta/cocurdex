import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AppDropdownContent,
  AppDropdownItem,
  appDropdownContentClassName,
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

  it("hugs the longest row but never goes below the trigger width", () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <AppDropdownContent>
          <AppDropdownItem>First</AppDropdownItem>
        </AppDropdownContent>
      </DropdownMenu>,
    );

    const classes = screen.getByRole("menu").className.split(" ");
    expect(classes).not.toContain("w-(--anchor-width)");
    expect(classes).toContain("min-w-(--anchor-width)");
    expect(classes).toContain(
      "max-w-[min(var(--popup-max-width,420px),calc(100vw-2rem))]",
    );
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
