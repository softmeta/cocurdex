import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppDropdownContent, AppDropdownItem } from "@/components";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";

describe("AppDropdownContent", () => {
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
