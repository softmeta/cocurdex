import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TranscriptStateProvider,
  useTranscriptState,
} from "./transcript-state";

function Draft({ messageId }: { messageId: string }) {
  const [draft, setDraft] = useTranscriptState(`draft:${messageId}`, "");
  return (
    <input
      aria-label="Draft"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

function Harness({
  visible,
  messageId = "first",
}: {
  visible: boolean;
  messageId?: string;
}) {
  return (
    <TranscriptStateProvider>
      {visible ? <Draft key={messageId} messageId={messageId} /> : null}
    </TranscriptStateProvider>
  );
}

describe("transcript interaction state", () => {
  it("restores a draft when its virtual conversation mounts again", () => {
    const { rerender } = render(<Harness visible />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Unsaved edit" },
    });
    rerender(<Harness visible={false} />);
    rerender(<Harness visible />);
    expect(screen.getByRole("textbox")).toHaveValue("Unsaved edit");
    rerender(<Harness visible messageId="second" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("does not leak drafts into another transcript view", () => {
    const { unmount } = render(<Harness visible />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Private draft" },
    });
    unmount();
    render(<Harness visible />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
