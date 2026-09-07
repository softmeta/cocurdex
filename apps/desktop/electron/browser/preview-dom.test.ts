import { afterEach, describe, expect, it, vi } from "vitest";
import { updatePreviewDom } from "./preview-dom";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("streaming preview DOM", () => {
  it("updates existing nodes without clearing the page and preserves the script policy", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    document.head.innerHTML =
      '<meta http-equiv="Content-Security-Policy" content="script-src none">';
    document.body.innerHTML = "<main><p>First</p></main>";
    const main = document.querySelector("main");
    const paragraph = document.querySelector("p");
    const result = updatePreviewDom(
      '<title>Report</title><style>p { color: red }</style><main><p>First and second</p><button onclick="alert(1)">Go</button><script>alert(1)</script><iframe srcdoc="bad"></iframe></main>',
    );
    expect(document.querySelector("main")).toBe(main);
    expect(document.querySelector("p")).toBe(paragraph);
    expect(paragraph?.textContent).toBe("First and second");
    expect(document.querySelector("script, iframe, [onclick]")).toBeNull();
    expect(document.querySelector("meta[http-equiv]")).not.toBeNull();
    expect(result.title).toBe("Report");
  });

  it("follows the bottom but preserves the position of a reader who scrolled up", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(500);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
      2000,
    );
    const position = vi.spyOn(window, "scrollY", "get").mockReturnValue(300);
    updatePreviewDom("<p>Update</p>");
    expect(scroll).toHaveBeenLastCalledWith({ top: 300, behavior: "instant" });
    position.mockReturnValue(1500);
    updatePreviewDom("<p>Another update</p>");
    expect(scroll).toHaveBeenLastCalledWith({ top: 2000, behavior: "instant" });
  });
});
