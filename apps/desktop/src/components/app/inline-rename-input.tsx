import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib";

export function AppInlineRenameInput({
  initialTitle,
  untitledLabel,
  ariaLabel,
  onCancel,
  onCommit,
}: {
  initialTitle: string;
  untitledLabel: string;
  ariaLabel: string;
  onCancel: () => void;
  onCommit: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialTitle || untitledLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipCommitRef = useRef(false);
  const committingRef = useRef(false);
  const didFocusRef = useRef(false);
  // Keep the callback identity stable. An inline callback ref is recreated on
  // every keystroke re-render; React then re-attaches it and re-runs select(),
  // which wipes the caret and makes continuous typing impossible.
  const setInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (!node || didFocusRef.current) {
      return;
    }
    didFocusRef.current = true;
    node.focus();
    node.select();
  }, []);

  const commit = async () => {
    if (skipCommitRef.current || committingRef.current) {
      skipCommitRef.current = false;
      return;
    }
    committingRef.current = true;
    try {
      await onCommit(value);
    } finally {
      committingRef.current = false;
    }
  };

  return (
    <input
      ref={setInputRef}
      type="text"
      value={value}
      aria-label={ariaLabel}
      className={cn(
        "h-6 min-w-0 flex-1 rounded-control border border-ring bg-background px-1 text-body leading-6 text-sidebar-fg",
        "outline-none",
      )}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          inputRef.current?.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          skipCommitRef.current = true;
          onCancel();
        }
      }}
    />
  );
}
