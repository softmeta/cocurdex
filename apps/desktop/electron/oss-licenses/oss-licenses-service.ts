import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, shell } from "electron";
import type { OssLicensesPayload } from "@/lib/types";
import { parseOssLicensesFile } from "./oss-licenses-file";
import {
  resolveChromiumLicensesCandidates,
  resolveOssLicensesFilePath,
} from "./oss-licenses-paths";

function desktopRootFromModule(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

export async function findChromiumLicensesPath(): Promise<string | null> {
  return firstExistingPath(
    resolveChromiumLicensesCandidates({
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
    }),
  );
}

export async function readOssLicensesPayload(): Promise<OssLicensesPayload> {
  const filePath = resolveOssLicensesFilePath({
    desktopRoot: desktopRootFromModule(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const file = parseOssLicensesFile(raw);
  return {
    chromiumAvailable: (await findChromiumLicensesPath()) !== null,
    entries: file.entries,
    texts: file.texts,
  };
}

export async function openChromiumLicenses(): Promise<{ ok: boolean }> {
  const filePath = await findChromiumLicensesPath();
  if (!filePath) {
    return { ok: false };
  }
  const error = await shell.openPath(filePath);
  return { ok: error.length === 0 };
}
