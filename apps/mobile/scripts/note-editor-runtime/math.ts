import katex from "katex";
import { NOTE_MATH_READY_EVENT } from "./math-contract";

window.noteMath = {
  render(tex, display) {
    try {
      const html = katex.renderToString(tex, {
        displayMode: display,
        output: "mathml",
        throwOnError: true,
      });
      return { html, error: null };
    } catch (error) {
      return {
        html: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
window.dispatchEvent(new Event(NOTE_MATH_READY_EVENT));
