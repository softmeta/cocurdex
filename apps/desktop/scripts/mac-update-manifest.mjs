import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const architectures = ["arm64", "x64"];

export async function createMacManifest(directory, arch, version) {
  if (!architectures.includes(arch)) {
    throw new Error(`Unsupported Mac architecture: ${arch}`);
  }
  const files = [];
  for (const extension of ["zip", "dmg"]) {
    const url = `Cocurdex-mac-${arch}.${extension}`;
    const file = path.join(directory, url);
    const hash = createHash("sha512");
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
    }
    files.push({
      url,
      sha512: hash.digest("base64"),
      size: (await stat(file)).size,
    });
  }
  return { version, files };
}

export function mergeMacManifests(manifests, version, assets) {
  if (manifests.length !== architectures.length) {
    throw new Error("Both Mac architecture manifests are required");
  }
  const files = manifests.flatMap((manifest) => {
    if (manifest.version !== version || !Array.isArray(manifest.files)) {
      throw new Error("Mac update manifest version or files mismatch");
    }
    return manifest.files;
  });
  const expected = architectures.flatMap((arch) =>
    ["zip", "dmg"].map((extension) => `Cocurdex-mac-${arch}.${extension}`),
  );
  if (
    files.length !== expected.length ||
    expected.some(
      (name) => files.filter((file) => file.url === name).length !== 1,
    )
  ) {
    throw new Error(
      "Exactly one ZIP and DMG for each Mac architecture is required",
    );
  }
  for (const file of files) {
    if (
      typeof file.sha512 !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      !assets.some(
        (asset) => asset.name === file.url && asset.size === file.size,
      )
    ) {
      throw new Error(`Invalid or missing release artifact: ${file.url}`);
    }
  }
  files.sort((a, b) => expected.indexOf(a.url) - expected.indexOf(b.url));
  return {
    version,
    files,
    path: files[0].url,
    sha512: files[0].sha512,
    releaseDate: new Date().toISOString(),
  };
}

async function main() {
  const [mode, directory, version, arch] = process.argv.slice(2);
  if (!directory || !version) {
    throw new Error(
      "Usage: mac-update-manifest.mjs create|merge directory version [arch]",
    );
  }
  if (mode === "create") {
    const manifest = await createMacManifest(directory, arch, version);
    await writeFile(
      path.join(directory, `mac-update-${arch}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    return;
  }
  if (mode !== "merge") {
    throw new Error(`Unknown mode: ${mode}`);
  }
  const manifests = await Promise.all(
    architectures.map(async (architecture) =>
      JSON.parse(
        await readFile(
          path.join(directory, `mac-update-${architecture}.json`),
          "utf8",
        ),
      ),
    ),
  );
  const { assets } = JSON.parse(
    await readFile(path.join(directory, "assets.json"), "utf8"),
  );
  const manifest = mergeMacManifests(manifests, version, assets);
  await writeFile(
    path.join(directory, "latest-mac.yml"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
