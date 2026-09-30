import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type CustomScheme, net, protocol, WebContentsView } from "electron";
import {
  RENDERER_HOST,
  RENDERER_SCHEME,
  resolveRendererAssetPath,
} from "./renderer-asset-path";

const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;
const STORAGE_MIGRATION_PAGE = "storage-migration.html";
const STORAGE_MIGRATION_MARKER = "renderer-storage-migrated";
const READ_LOCAL_STORAGE = "Object.entries(localStorage)";

export const rendererScheme: CustomScheme = {
  scheme: RENDERER_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    codeCache: true,
  },
};

export function registerRendererProtocol(rootDir: string) {
  protocol.handle(RENDERER_SCHEME, (request) => {
    const filePath = resolveRendererAssetPath(rootDir, request.url);
    if (!filePath) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function devRendererUrl(): URL | null {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) {
    return null;
  }
  const url = new URL(rendererUrl);
  const isLocalHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  return isLocalHttp ? url : null;
}

export function rendererPageUrl(query: Record<string, string> = {}): string {
  const url = devRendererUrl() ?? new URL(`${RENDERER_ORIGIN}/index.html`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function restoreLocalStorageScript(entries: [string, string][]) {
  return `for (const [key, value] of ${JSON.stringify(entries)}) {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }`;
}

export async function migrateLegacyRendererStorage(options: {
  rootDir: string;
  userDataPath: string;
}) {
  const marker = path.join(options.userDataPath, STORAGE_MIGRATION_MARKER);
  if (devRendererUrl() || existsSync(marker)) {
    return;
  }
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
  const { webContents } = view;
  try {
    await webContents.loadFile(
      path.join(options.rootDir, STORAGE_MIGRATION_PAGE),
    );
    const entries: [string, string][] =
      await webContents.executeJavaScript(READ_LOCAL_STORAGE);
    if (entries.length > 0) {
      await webContents.loadURL(`${RENDERER_ORIGIN}/${STORAGE_MIGRATION_PAGE}`);
      await webContents.executeJavaScript(restoreLocalStorageScript(entries));
    }
  } finally {
    webContents.close();
  }
  await writeFile(marker, "");
}
