import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { onOpenHtmlPreview } from "@/lib/browser-preview-events";
import { htmlPreviewLocationAtom } from "@/lib/html-preview-preference";
import { desktopApi } from "@/lib/ipc";
import { MarkdownRenderer } from "../markdown-renderer";

const scrollToDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (scrollToDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollTo",
      scrollToDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
});

describe("HTML code fence preview", () => {
  it("shows the latest code when the completed message mounts as a new component", async () => {
    const store = createStore();
    store.set(htmlPreviewLocationAtom, "browser");
    const content = `\`\`\`html\n${"<p>Line</p>\n".repeat(80)}\`\`\``;
    const message = (key: string, streaming: boolean) => (
      <Provider store={store}>
        <MarkdownRenderer key={key} content={content} streaming={streaming} />
      </Provider>
    );
    const { rerender } = render(message("live", true));
    await screen.findByRole("region", { name: "Code" });
    rerender(message("completed", false));
    const region = await screen.findByRole("region", { name: "Code" });
    Object.defineProperty(region, "scrollHeight", {
      configurable: true,
      value: 1400,
    });
    await waitFor(() => expect(region.scrollTop).toBe(1400));
    store.set(htmlPreviewLocationAtom, "chat");
  });
  it("keeps the stable code container at the latest line when streaming completes", async () => {
    const store = createStore();
    store.set(htmlPreviewLocationAtom, "browser");
    const code = `<main>\n${"<p>Line</p>\n".repeat(80)}</main>`;
    const renderContent = (streaming: boolean) => (
      <Provider store={store}>
        <MarkdownRenderer
          content={`\`\`\`html\n${code}\n\`\`\``}
          streaming={streaming}
        />
      </Provider>
    );
    const { container, rerender } = render(renderContent(true));
    await waitFor(() =>
      expect(
        container.querySelector('[data-streamdown="code-block-body"]'),
      ).not.toBeNull(),
    );
    const body = screen.getByRole("region", { name: "Code" });
    Object.defineProperty(body, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    body.scrollTop = 500;
    rerender(renderContent(false));
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Code" }) === body).toBe(true);
      expect(body.scrollTop).toBe(1000);
    });
    store.set(htmlPreviewLocationAtom, "chat");
  });
  it("delivers the final document to the sidebar when the streaming renderer completes", async () => {
    const store = createStore();
    store.set(htmlPreviewLocationAtom, "browser");
    let resolveOpen: ((url: string | null) => void) | undefined;
    const unsubscribe = onOpenHtmlPreview((_html, resolve) => {
      resolveOpen = resolve;
    });
    const update = vi
      .spyOn(desktopApi, "browserUpdateHtml")
      .mockResolvedValue(true);
    const code = "<h1>Final browser content</h1>";
    try {
      const { rerender } = render(
        <Provider store={store}>
          <MarkdownRenderer content={"```html\n<h1>First"} streaming />
        </Provider>,
      );
      await waitFor(() => expect(resolveOpen).toBeDefined());
      expect(screen.queryByTitle("HTML preview")).not.toBeInTheDocument();
      rerender(
        <Provider store={store}>
          <MarkdownRenderer content={`\`\`\`html\n${code}\n\`\`\``} />
        </Provider>,
      );
      resolveOpen?.("preview-url");
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith(
          "preview-url",
          expect.stringContaining(code),
          expect.any(String),
          false,
        ),
      );
    } finally {
      unsubscribe();
      update.mockRestore();
      store.set(htmlPreviewLocationAtom, "chat");
    }
  });
  it("opens the original completed HTML in the built-in browser", async () => {
    const receiveHtml = vi.fn();
    const unsubscribe = onOpenHtmlPreview(receiveHtml);
    const code = "<h1>Browser preview</h1>";
    try {
      const { rerender } = render(
        <MarkdownRenderer content={`\`\`\`html\n${code}`} streaming />,
      );
      const button = screen.getByRole("button", {
        name: "Open in built-in browser",
      });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(receiveHtml).not.toHaveBeenCalled();
      rerender(<MarkdownRenderer content={`\`\`\`html\n${code}\n\`\`\``} />);
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Open in built-in browser" }),
        ).toBeEnabled();
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Open in built-in browser" }),
      );
      await waitFor(() =>
        expect(receiveHtml.mock.calls[0]?.[0].trimEnd()).toBe(code),
      );
    } finally {
      unsubscribe();
    }
  });

  it("keeps generated HTML isolated and enables scripts only after its fence closes", async () => {
    const code = "<h1>Preview</h1><script>window.ready = true</script>";
    const { container, rerender } = render(
      <MarkdownRenderer content={`\`\`\`html\n${code}`} streaming />,
    );

    expect(container.querySelector("h1")).toBeNull();

    const frame = screen.getByTitle("HTML preview") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.srcdoc).toContain("script-src 'nonce-");
    expect(frame.srcdoc).toContain(code);

    rerender(
      <MarkdownRenderer
        content={`\`\`\`html\n${code}\n\`\`\`\n\nStill responding`}
        streaming
      />,
    );
    expect(screen.getByTitle("HTML preview")).toBe(frame);
    expect(frame.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(frame.srcdoc).toContain(code);
    rerender(<MarkdownRenderer content={`\`\`\`html\n${code}\n\`\`\``} />);
    expect(screen.getByRole("button", { name: "Copy code" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download HTML" })).toBeEnabled();
    fireEvent.click(screen.getByRole("tab", { name: "Code" }));
    await waitFor(() => {
      expect(screen.queryByTitle("HTML preview")).not.toBeInTheDocument();
    });
  });
});
