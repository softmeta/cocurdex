import { CocurdexMark } from "@/components/cocurdex-mark";

/**
 * What the window shows between "visible" and "stores hydrated". The panels
 * are deliberately absent: their chrome (sidebar separator, panel borders)
 * framing an empty app reads as a broken layout, while a single centered mark
 * reads as launching. The whole surface stays draggable so the window can be
 * moved before the app is interactive.
 */
export function BootSplash() {
  return (
    <div className="app-drag flex h-screen items-center justify-center bg-app">
      <CocurdexMark className="boot-mark size-20" />
    </div>
  );
}
