import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cn } from "@/lib";

/**
 * Shared visual shell for every chrome icon control (titlebar + panel toolbars):
 * - left: sidebar toggle, back, forward
 * - center-right: view switcher tabs
 * - far-right: proxy status, maximize, panel, settings
 * - right-panel toolbars: editor / git / browser / pdf / terminal / issues
 *
 * size-6 square pill inset in the 32px titlebar row (4px breath each side).
 * Panel toolbars reuse the same footprint so icons stay consistent across chrome.
 */
export function titlebarIconButtonClassName(options?: {
  active?: boolean;
  className?: string;
}): string {
  const isActive = options?.active ?? false;
  return cn(
    "relative flex size-6 min-w-6 shrink-0 items-center justify-center rounded-control border-0 px-0 font-normal shadow-none transition-colors",
    "focus-visible:border-transparent focus-visible:ring-0 outline-none",
    isActive
      ? "bg-editor-tab-active-bg text-editor-fg hover:bg-editor-tab-active-bg hover:text-editor-fg"
      : "bg-transparent text-editor-fg-subtle hover:bg-editor-tab-hover-bg hover:text-editor-fg",
    options?.className,
  );
}

/** Lucide glyph size inside titlebar icon buttons / view-switcher tabs. */
export const TITLEBAR_ICON_GLYPH_CLASS = "size-3.5";

export type TitlebarIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  children: ReactNode;
  cursor?: "pointer" | "default";
  /** Selected / pressed chrome (e.g. maximized, active toggle). */
  active?: boolean;
};

export const TitlebarIconButton = forwardRef<
  HTMLButtonElement,
  TitlebarIconButtonProps
>(function TitlebarIconButton(
  {
    "aria-label": ariaLabel,
    children,
    className,
    cursor = "pointer",
    disabled = false,
    active = false,
    type = "button",
    ...props
  },
  ref,
) {
  // macOS titlebar toolbar items use the default arrow cursor rather than the
  // pointer hand; callers that follow that convention pass cursor="default".
  const cursorClass =
    cursor === "default" ? "cursor-default" : !disabled && "cursor-pointer";

  return (
    <button
      ref={ref}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={cn(
        "app-no-drag disabled:pointer-events-none disabled:text-editor-fg-subtle/40",
        titlebarIconButtonClassName({ active }),
        cursorClass,
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
});

/** @deprecated Prefer `TitlebarIconButton` — kept as a stable alias. */
export const TitlebarButton = TitlebarIconButton;
