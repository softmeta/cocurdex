import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

interface InlineEditProps {
  value: string;
  editing: boolean;
  onSubmit: (next: string) => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
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
  const cancelledRef = useRef(false);

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
