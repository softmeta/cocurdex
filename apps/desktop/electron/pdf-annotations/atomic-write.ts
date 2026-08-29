import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function atomicWriteText(
  absolutePath: string,
  content: string,
): Promise<void> {
  const directory = path.dirname(absolutePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await writeFile(temporaryPath, content, { encoding: "utf8" });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
