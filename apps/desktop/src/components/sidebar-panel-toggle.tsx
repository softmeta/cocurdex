import { PanelLeft } from "lucide-react";

/**
 * Collapse / expand control for notes & issues sidebars.
 *
 * Layout box is exactly `size-3.5` so it shares a centerline with sibling
 * meta labels (`items-center` + `leading-none`). Hit target grows via an
 * absolute inset so padding never shifts flex alignment.
 *
 * Parent should use the same start inset as the list (`ps-2` /
 * `paddingInlineStart: 8` / row `px-2`).
 */
export function SidebarPanelToggle({
  onClick,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group relative flex size-3.5 shrink-0 items-center justify-center text-editor-fg-subtle hover:text-editor-fg"
    >
      {/* Hit target only — must not affect the flex layout box. */}
      <span
        aria-hidden
        className="absolute -inset-1.5 rounded-control group-hover:bg-editor-tab-hover-bg"
      />
      <PanelLeft className="relative size-3.5" />
    </button>
  );
}

/**
 * Collapsed rail: same shell padding + start inset as the open sidebar header.
 *
 * `chromeSeparator` — issues display bar is `h-8 border-b`; when the sidebar is
 * collapsed the rail sits beside that bar, so the separator must continue under
 * the toggle or a short segment is missing on the left.
 */
export function SidebarCollapsedRail({
  onExpand,
  expandLabel,
  chromeSeparator = false,
}: {
  onExpand: () => void;
  expandLabel: string;
  chromeSeparator?: boolean;
}) {
  if (chromeSeparator) {
    // pt-2 + h-6 = h-8; ps-4 = open sidebar p-2 + header px-2.
    return (
      <div className="flex h-full min-h-0 shrink-0 flex-col bg-editor-shell">
        <div className="flex h-8 shrink-0 items-start border-b border-editor-border pt-2 pe-2 ps-4">
          <div className="flex h-6 items-center">
            <SidebarPanelToggle onClick={onExpand} aria-label={expandLabel} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col bg-editor-shell p-2">
      <div className="flex h-6 items-center ps-2">
        <SidebarPanelToggle onClick={onExpand} aria-label={expandLabel} />
      </div>
    </div>
  );
}
