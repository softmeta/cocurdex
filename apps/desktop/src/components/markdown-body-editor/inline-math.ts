type Katex = typeof import("katex").default;

let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

function loadKatex() {
  loading ??= import("katex").then((module) => {
    katex = module.default;
    return katex;
  });
  return loading;
}

export function renderInlineMath(tex: string, target: HTMLElement) {
  if (katex) {
    katex.render(tex, target, { throwOnError: false });
    return;
  }
  target.textContent = tex;
  void loadKatex().then((loaded) => {
    loaded.render(tex, target, { throwOnError: false });
  });
}
