import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillDocument } from "@cocurdex/shared";
import { parseSkillManifest, SKILL_FILE_NAME } from "./skill-manifest";

const MAX_DOCUMENT_BYTES = 256 * 1024;

export async function readSkillDocument(
  skillDir: string,
): Promise<SkillDocument | null> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(skillDir, SKILL_FILE_NAME));
  } catch {
    return null;
  }
  const truncated = buffer.length > MAX_DOCUMENT_BYTES;
  const content = buffer.subarray(0, MAX_DOCUMENT_BYTES).toString("utf8");
  return {
    content,
    truncated,
    license: parseSkillManifest(content, path.basename(skillDir)).license,
  };
}
