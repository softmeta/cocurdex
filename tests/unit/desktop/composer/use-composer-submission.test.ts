import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useComposerSubmission } from "@/features/composer/use-composer-submission";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("useComposerSubmission", () => {
  it("clears the draft when the send is accepted", () => {
    const { result } = renderHook(() => useComposerSubmission());
    const clear = vi.fn();

    act(() => {
      result.current.submit(() => "sent", clear);
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(false);
  });

  it("keeps the draft while a gated send is pending", async () => {
    const { result } = renderHook(() => useComposerSubmission());
    const clear = vi.fn();
    let settle: (outcome: "sent" | "kept") => void = () => {};
    const gated = new Promise<"sent" | "kept">((resolve) => {
      settle = resolve;
    });

    act(() => {
      result.current.submit(() => gated, clear);
    });
    expect(result.current.submitting).toBe(true);
    expect(clear).not.toHaveBeenCalled();

    await act(async () => {
      settle("sent");
      await gated;
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(false);
  });

  it("keeps the draft when the send is declined", async () => {
    const { result } = renderHook(() => useComposerSubmission());
    const clear = vi.fn();
    let settle: (outcome: "sent" | "kept") => void = () => {};
    const gated = new Promise<"sent" | "kept">((resolve) => {
      settle = resolve;
    });

    act(() => {
      result.current.submit(() => gated, clear);
    });

    await act(async () => {
      settle("kept");
      await gated;
    });

    expect(clear).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("keeps the draft and reports a rejected send", async () => {
    const { result } = renderHook(() => useComposerSubmission());
    const clear = vi.fn();
    const failure = new Error("daemon offline");

    await act(async () => {
      result.current.submit(async () => {
        throw failure;
      }, clear);
    });

    expect(clear).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
    expect(toastError).toHaveBeenCalledWith("daemon offline");
  });

  it("ignores a second submit while the first is in flight", () => {
    const { result } = renderHook(() => useComposerSubmission());
    const firstClear = vi.fn();
    const secondClear = vi.fn();

    act(() => {
      result.current.submit(() => new Promise<"sent">(() => {}), firstClear);
      result.current.submit(() => "sent", secondClear);
    });

    expect(secondClear).not.toHaveBeenCalled();
  });
});
