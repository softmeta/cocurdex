import mermaid from "mermaid";

function post(message) {
  window.ReactNativeWebView.postMessage(JSON.stringify(message));
}

function rasterize(svg, box) {
  const sized = svg.cloneNode(true);
  sized.setAttribute("width", String(box.width));
  sized.setAttribute("height", String(box.height));
  sized.removeAttribute("style");
  const scale =
    Math.min(1, window.innerWidth / box.width) * (window.devicePixelRatio || 1);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(box.width * scale);
      canvas.height = Math.ceil(box.height * scale);
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, box.width, box.height);
      try {
        resolve(canvas.toDataURL("image/png").split(",")[1] || null);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      new XMLSerializer().serializeToString(sized),
    )}`;
  });
}

async function render({ id, source, config }) {
  const container = document.getElementById("diagram");
  try {
    mermaid.initialize(config);
    const result = await mermaid.render(`cocurdex-mermaid-${id}`, source);
    container.innerHTML = result.svg;
    const svg = container.querySelector("svg");
    const box = svg.viewBox.baseVal;
    const markup = container.innerHTML;
    const png = await rasterize(svg, box);
    post({
      type: "rendered",
      id,
      svg: markup,
      width: box.width,
      height: box.height,
      png,
    });
  } catch {
    post({ type: "error", id });
  } finally {
    container.innerHTML = "";
  }
}

let queue = Promise.resolve();

window.cocurdexMermaid = {
  render(request) {
    queue = queue.then(() => render(request));
  },
};

post({ type: "ready" });
