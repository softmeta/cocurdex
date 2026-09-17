import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const desktopApiMock = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock("@/lib", () => ({ desktopApi: desktopApiMock }));

import { LinkifiedText } from "@/components/chat/linkified-text";

describe("LinkifiedText", () => {
  beforeEach(() => {
    desktopApiMock.openExternal.mockReset();
  });

  it("renders plain text without links", () => {
    render(<LinkifiedText text="解读下这个" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("解读下这个")).toBeInTheDocument();
  });

  it("opens a URL in the system browser instead of navigating", () => {
    render(
      <LinkifiedText text="解读下这个 https://cursor.com/cn/blog/projects" />,
    );

    const link = screen.getByRole("link", {
      name: "https://cursor.com/cn/blog/projects",
    });
    fireEvent.click(link);

    expect(desktopApiMock.openExternal).toHaveBeenCalledWith(
      "https://cursor.com/cn/blog/projects",
    );
  });

  it("gives bare www hosts an absolute href", () => {
    render(<LinkifiedText text="go to www.example.com" />);

    const link = screen.getByRole("link", { name: "www.example.com" });

    expect(link).toHaveAttribute("href", "https://www.example.com");

    fireEvent.click(link);

    expect(desktopApiMock.openExternal).toHaveBeenCalledWith(
      "https://www.example.com",
    );
  });
});
