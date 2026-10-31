const DIAGRAM_FILENAME = "diagram.svg";

export function downloadMermaidSvg(svg: string) {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.download = DIAGRAM_FILENAME;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
