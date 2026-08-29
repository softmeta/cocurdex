import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

interface InlineEditProps {
  // Current persisted value, shown as the initial draft when editing starts.
  value: string;
  // Whether the input is shown; the parent owns this so it can pick the
  // trigger (single vs. double click) and where focus returns afterwards.
  editing: boolean;
  // Called with the trimmed draft on Enter or blur (when not cancelled).
  onSubmit: (next: string) => void;
  // Called on Escape; the draft is discarded.
  onCancel: () => void;
  placeholder?: string;
  // Applied to the <input> so it can be styled to match the display text.
  className?: string;
  // Rendered when not editing.
  children: ReactNode;
}

export function InlineEdit({
  value,
  editing,
  onSubmit,
  onCancel,
  placeholder,
  className,
  children,
}: InlineEditProps) {
  if (!editing) return <>{children}</>;

  // Mounting the input only while editing lets it seed its draft from `value`
  // via useState init and focus via a callback ref — no effect syncing props
  // into state or imperatively driving focus.
  return (
    <InlineEditInput
      value={value}
      onSubmit={onSubmit}
      onCancel={onCancel}
      placeholder={placeholder}
      className={className}
    />
  );
}

function InlineEditInput({
  value,
  onSubmit,
  onCancel,
  placeholder,
  className,
}: Pick<
  InlineEditProps,
  "value" | "onSubmit" | "onCancel" | "placeholder" | "className"
>) {
  const [draft, setDraft] = useState(value);
  // Set when Escape cancels so the unmount-triggered blur does not also commit.
  const cancelledRef = useRef(false);

  // Fires when the input attaches: focus and select the seeded draft.
  const focusRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
      node.select();
    }
  }, []);

  const commit = () => {
    if (cancelledRef.current) return;
    onSubmit(draft.trim());
  };

  return (
    <input
      ref={focusRef}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
      }}
      className={className}
    />
  );
}
