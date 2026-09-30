import path from "node:path";

export const RENDERER_SCHEME = "app";
export const RENDERER_HOST = "renderer";

export function resolveRendererAssetPath(
  rootDir: string,
  requestUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${RENDERER_SCHEME}:` || url.host !== RENDERER_HOST) {
    return null;
  }
  const segments: string[] = [];
  for (const raw of url.pathname.split("/")) {
    if (!raw) continue;
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (segment === ".." || /[/\\]/.test(segment)) return null;
    segments.push(segment);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(
    root,
    ...(segments.length ? segments : ["index.html"]),
  );
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
