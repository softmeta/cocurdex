import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createMacManifest,
  mergeMacManifests,
} from "./mac-update-manifest.mjs";

test("publishes both architectures with hashes of the actual artifacts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mac-manifest-"));
  try {
    const manifests = [];
    for (const arch of ["arm64", "x64"]) {
      for (const ext of ["zip", "dmg"]) {
        await writeFile(
          path.join(directory, `Cocurdex-mac-${arch}.${ext}`),
          `${arch}-${ext}`,
        );
      }
      manifests.push(await createMacManifest(directory, arch, "1.2.3"));
    }
    const assets = manifests.flatMap((manifest) =>
      manifest.files.map((file) => ({ name: file.url, size: file.size })),
    );
    const merged = mergeMacManifests(manifests, "1.2.3", assets);
    assert.equal(merged.files.length, 4);
    assert.equal(
      merged.files[0].sha512,
      createHash("sha512").update("arm64-zip").digest("base64"),
    );
    assert.throws(() => mergeMacManifests([manifests[1]], "1.2.3", assets));
    assert.throws(() =>
      mergeMacManifests([manifests[1], manifests[1]], "1.2.3", assets),
    );
    assert.throws(() => mergeMacManifests(manifests, "1.2.4", assets));
    assert.throws(() => mergeMacManifests(manifests, "1.2.3", assets.slice(1)));
    assert.throws(() =>
      mergeMacManifests(
        manifests,
        "1.2.3",
        assets.map((asset) => ({ ...asset, size: 1 })),
      ),
    );
    const corrupt = structuredClone(manifests);
    corrupt[0].files[0].sha512 = "invalid";
    assert.throws(() => mergeMacManifests(corrupt, "1.2.3", assets));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
