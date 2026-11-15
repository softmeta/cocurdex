import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui";
import { McpRuntimeSubmenu } from "@/features/composer/mcp-runtime-submenu";
import { i18n } from "@/i18n";

describe("McpRuntimeSubmenu", () => {
  it("opens its grouped status list without throwing", async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <McpRuntimeSubmenu
            defaultOpen
            servers={[{ name: "filesystem", status: "connected" }]}
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: /MCP/ }));

    await vi.waitFor(() => {
      expect(
        screen.getByText(i18n.t("sessions:modelMenu.mcpServers")),
      ).toBeInTheDocument();
      expect(screen.getByText("filesystem")).toBeInTheDocument();
    });
  });
});
