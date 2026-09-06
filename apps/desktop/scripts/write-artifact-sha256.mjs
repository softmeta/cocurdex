import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const filePath = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Missing artifact path");
}

const digest = createHash("sha256")
  .update(await readFile(filePath))
  .digest("hex");
const outputPath = `${filePath}.sha256`;
await writeFile(outputPath, `${digest}  ${path.basename(filePath)}\n`);
console.log(outputPath);
