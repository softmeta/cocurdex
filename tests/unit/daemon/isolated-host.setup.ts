import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll } from "vitest";

const tempDirs = createTempDirs();
const home = tempDirs.createSync("cocurdex-unit-home-");
const bin = tempDirs.createSync("cocurdex-unit-bin-");

if (process.platform === "win32") {
  writeFileSync(path.join(bin, "rsrs.cmd"), "@exit /b 1\r\n", "utf8");
} else {
  const rsrs = path.join(bin, "rsrs");
  writeFileSync(rsrs, "#!/bin/sh\nexit 1\n", "utf8");
  chmodSync(rsrs, 0o755);
}

const pathKey =
  Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ??
  "PATH";
process.env[pathKey] = `${bin}${path.delimiter}${process.env[pathKey] ?? ""}`;
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.RSRS_DATA_DIR = path.join(home, ".rsrs");

afterAll(() => tempDirs.cleanup());
