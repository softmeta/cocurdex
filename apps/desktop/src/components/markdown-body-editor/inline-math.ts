export function renderInlineMath(tex: string, target: HTMLElement) {
  target.textContent = tex;
  void import("katex").then(({ default: katex }) => {
    katex.render(tex, target, { throwOnError: false });
  });
}
