import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const filePath = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Missing artifact path");
}

const hash = createHash("sha256");
for await (const chunk of createReadStream(filePath)) {
  hash.update(chunk);
}
const digest = hash.digest("hex");
const outputPath = `${filePath}.sha256`;
await writeFile(outputPath, `${digest}  ${path.basename(filePath)}\n`);
console.log(outputPath);
