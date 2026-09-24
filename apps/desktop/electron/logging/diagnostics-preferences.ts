import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface DiagnosticsPreferences {
  verbose: boolean;
}

const DEFAULT_PREFERENCES: DiagnosticsPreferences = { verbose: false };

export function readDiagnosticsPreferences(
  filePath: string,
): DiagnosticsPreferences {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as Record<string, unknown>).verbose === true
    ) {
      return { verbose: true };
    }
  } catch {
    // Missing or malformed preferences fall back to defaults.
  }
  return DEFAULT_PREFERENCES;
}

export function writeDiagnosticsPreferences(
  filePath: string,
  preferences: DiagnosticsPreferences,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
}
