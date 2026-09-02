import type { OssLicenseEntry } from "@/lib/types";

export const OSS_LICENSES_FILE_VERSION = 1;

export type OssLicensesFile = {
  entries: OssLicenseEntry[];
  generatedAt: string;
  texts: Record<string, string>;
  version: typeof OSS_LICENSES_FILE_VERSION;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): OssLicenseEntry {
  if (!isRecord(value)) {
    throw new Error("Invalid OSS license entry");
  }
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    typeof value.license !== "string" ||
    (value.kind !== "app" &&
      value.kind !== "package" &&
      value.kind !== "native") ||
    (value.version !== null && typeof value.version !== "string") ||
    (value.homepage !== null && typeof value.homepage !== "string") ||
    (value.textId !== null && typeof value.textId !== "string")
  ) {
    throw new Error("Invalid OSS license entry");
  }
  return {
    homepage: value.homepage,
    id: value.id,
    kind: value.kind,
    license: value.license,
    name: value.name,
    textId: value.textId,
    version: value.version,
  };
}

export function parseOssLicensesFile(raw: unknown): OssLicensesFile {
  if (!isRecord(raw)) {
    throw new Error("Invalid OSS licenses file");
  }
  if (raw.version !== OSS_LICENSES_FILE_VERSION) {
    throw new Error("Unsupported OSS licenses file version");
  }
  if (typeof raw.generatedAt !== "string" || !Array.isArray(raw.entries)) {
    throw new Error("Invalid OSS licenses file");
  }
  if (!isRecord(raw.texts)) {
    throw new Error("Invalid OSS licenses file");
  }
  const texts: Record<string, string> = {};
  for (const [textId, text] of Object.entries(raw.texts)) {
    if (typeof text !== "string") {
      throw new Error("Invalid OSS licenses file");
    }
    texts[textId] = text;
  }
  return {
    entries: raw.entries.map(parseEntry),
    generatedAt: raw.generatedAt,
    texts,
    version: OSS_LICENSES_FILE_VERSION,
  };
}
