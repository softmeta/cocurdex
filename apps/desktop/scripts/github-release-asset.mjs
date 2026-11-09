import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export async function downloadGitHubReleaseAsset(
  repository,
  tag,
  filename,
  destination,
) {
  const api = `https://api.github.com/repos/${repository}/releases`;
  const release = await fetch(`${api}/tags/${tag}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!release.ok) {
    throw new Error(`Release lookup for ${repository}: ${release.status}`);
  }
  const { assets } = await release.json();
  const asset = assets.find(({ name }) => name === filename);
  if (!asset) throw new Error(`${repository} ${tag} is missing ${filename}`);

  const response = await fetch(`${api}/assets/${asset.id}`, {
    headers: { Accept: "application/octet-stream" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download for ${filename}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}
