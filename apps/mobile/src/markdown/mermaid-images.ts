import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { diagramPalette } from "./diagram-palette";
import type { RenderedDiagram } from "./mermaid-cache";
import type { DiagramJob, RenderedOutput } from "./mermaid-renderer";
import { MERMAID_RUNTIME_VERSION } from "./mermaid-runtime.generated";

const root = new Directory(Paths.cache, "mermaid");
const directory = new Directory(root, MERMAID_RUNTIME_VERSION);
let prepared = false;

function prepare() {
  if (prepared) return;
  prepared = true;
  try {
    if (root.exists) {
      for (const entry of root.list()) {
        if (entry.uri !== directory.uri) entry.delete();
      }
    }
    if (!directory.exists) directory.create({ intermediates: true });
  } catch {
    return;
  }
}

async function entryName({ source, appearance }: DiagramJob) {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `${JSON.stringify(diagramPalette(appearance))}\n${appearance}\n${source}`,
  );
}

type StoredDiagram = { svg: string; width: number; height: number };

function isStoredDiagram(value: unknown): value is StoredDiagram {
  if (!value || typeof value !== "object") return false;
  const { svg, width, height } = value as Partial<StoredDiagram>;
  return (
    typeof svg === "string" &&
    typeof width === "number" &&
    typeof height === "number"
  );
}

export async function cachedDiagram(
  job: DiagramJob,
): Promise<RenderedDiagram | null> {
  prepare();
  const name = await entryName(job);
  const data = new File(directory, `${name}.json`);
  if (!data.exists) return null;
  const stored: unknown = JSON.parse(await data.text());
  if (!isStoredDiagram(stored)) return null;
  const image = new File(directory, `${name}.png`);
  return { ...stored, image: image.exists ? image.uri : null };
}

export async function saveDiagram(
  job: DiagramJob,
  { svg, width, height, png }: RenderedOutput,
): Promise<RenderedDiagram> {
  prepare();
  const name = await entryName(job);
  let image: string | null = null;
  if (png) {
    const file = new File(directory, `${name}.png`);
    try {
      await file.write(png, { encoding: "base64" });
      image = file.uri;
    } catch {
      image = null;
    }
  }
  const data = new File(directory, `${name}.json`);
  await data.write(JSON.stringify({ svg, width, height })).catch(() => null);
  return { svg, width, height, image };
}
