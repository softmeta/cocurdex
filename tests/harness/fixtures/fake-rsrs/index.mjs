import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FAKE_RSRS = fileURLToPath(new URL("./fake-rsrs.mjs", import.meta.url));

export async function writeFakeRsrs(directory, { statePath } = {}) {
  if (process.platform === "win32") {
    const wrapper = path.join(directory, "fake-rsrs.cmd");
    const state = statePath ? `set "FAKE_RSRS_STATE=${statePath}"\r\n` : "";
    await writeFile(
      wrapper,
      `@echo off\r\n${state}"${process.execPath}" "${FAKE_RSRS}" %*\r\n`,
      "utf8",
    );
    return wrapper;
  }
  const wrapper = path.join(directory, "fake-rsrs.sh");
  const state = statePath ? `export FAKE_RSRS_STATE='${statePath}'\n` : "";
  await writeFile(
    wrapper,
    `#!/bin/sh\n${state}exec "${process.execPath}" "${FAKE_RSRS}" "$@"\n`,
    "utf8",
  );
  await chmod(wrapper, 0o755);
  return wrapper;
}
