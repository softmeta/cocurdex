import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadNativeKeyring } from "./native-module";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createResources() {
  const resources = await mkdtemp(path.join(tmpdir(), "cd-native-"));
  directories.push(resources);
  const archive = path.join(resources, "app.asar");
  await mkdir(archive);
  await writeFile(path.join(archive, "package.json"), "{}");
  return { resources, archive };
}

it("resolves the packaged native module inside the application archive", async () => {
  const { resources, archive } = await createResources();
  const nativePackage = path.join(
    archive,
    "node_modules",
    "@napi-rs",
    "keyring",
  );
  await mkdir(nativePackage, { recursive: true });
  await writeFile(
    path.join(nativePackage, "index.js"),
    "module.exports = { AsyncEntry: class PackagedEntry {} };",
  );

  const native = await loadNativeKeyring(resources);

  expect(native.AsyncEntry.name).toBe("PackagedEntry");
});

it("rejects an incomplete package instead of using development dependencies", async () => {
  const { resources } = await createResources();

  await expect(loadNativeKeyring(resources)).rejects.toThrow(
    "Cannot find module",
  );
});
