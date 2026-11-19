export const NOTE_MATH_READY_EVENT = "notemathready";

export type MathRender =
  | { html: string; error: null }
  | { html: null; error: string };

declare global {
  interface Window {
    noteMath?: { render(tex: string, display: boolean): MathRender };
  }
}
