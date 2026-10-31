import { readFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  DECK_EXPORT_FORMATS,
  type DeckContent,
  type DeckExportFormat,
  type DeckOp,
  type DeckSource,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { readStdin } from "./read-stdin";

const USAGE = {
  show: "cocurdex deck show <id>",
  update: "cocurdex deck update <id>",
  edit: "cocurdex deck edit <id> --ops-file <path|->",
  image:
    "cocurdex deck image <id> --slide <slideId> --file <path.png|path.jpg> [--alt <text>] [--replace <elementId>]",
  import: "cocurdex deck import <file.pptx> [--title <t>] [--workspace <id>]",
  read: "cocurdex deck read <file.pptx> [--json]",
  delete: "cocurdex deck delete <id>",
  check: "cocurdex deck check <id>",
  export:
    "cocurdex deck export <id> --output <path.pptx|path.pdf> [--format pptx|pdf]",
} as const;

export async function handleDeckCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list") {
    const decks = await withDaemon(() => requestDaemon("deck.list"));
    printRows(
      decks,
      ["id", "title", "slideCount", "revision", "updatedAt"],
      parsed,
    );
    return true;
  }

  if (action === "show") {
    const id = requiredId(args, "show");
    const deck = await requireDeck(id);
    const issues = await withDaemon(() => requestDaemon("deck.check", { id }));
    printResult({ ...deck, issues }, parsed);
    return true;
  }

  if (action === "create") {
    const source = await readSource(parsed);
    const result = await withDaemon(() =>
      requestDaemon("deck.create", {
        ...source,
        title: stringFlag(parsed, "title"),
        workspaceId: stringFlag(parsed, "workspace") ?? null,
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "update") {
    const id = requiredId(args, "update");
    const expectedRevision =
      expectedRevisionFlag(parsed) ?? (await requireDeck(id)).revision;
    const source = await readSource(parsed);
    const result = await withDaemon(() =>
      requestDaemon("deck.update", {
        ...source,
        id,
        title: stringFlag(parsed, "title"),
        expectedRevision,
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "edit") {
    const id = requiredId(args, "edit");
    const ops = await readOps(getRequiredFlag(parsed, "ops-file"));
    const result = await withDaemon(() =>
      requestDaemon("deck.edit", {
        id,
        ops,
        expectedRevision: expectedRevisionFlag(parsed),
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "image") {
    const id = requiredId(args, "image");
    const slideId = getRequiredFlag(parsed, "slide");
    const filePath = path.resolve(getRequiredFlag(parsed, "file"));
    const replace = stringFlag(parsed, "replace");
    const alt = stringFlag(parsed, "alt");
    const image = await withDaemon(() =>
      requestDaemon("deck.importImage", { path: filePath }),
    );
    const op: DeckOp = replace
      ? { op: "setImage", slideId, elementId: replace, image }
      : { op: "addImage", slideId, image, ...(alt ? { alt } : {}) };
    const result = await withDaemon(() =>
      requestDaemon("deck.edit", {
        id,
        ops: [op],
        expectedRevision: expectedRevisionFlag(parsed),
      }),
    );
    printResult({ ...result, image }, parsed);
    return true;
  }

  if (action === "import") {
    const filePath = path.resolve(requiredId(args, "import"));
    const result = await withDaemon(() =>
      requestDaemon("deck.import", {
        path: filePath,
        title: stringFlag(parsed, "title"),
        workspaceId: stringFlag(parsed, "workspace") ?? null,
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "read") {
    const filePath = path.resolve(requiredId(args, "read"));
    const outline = await withDaemon(() =>
      requestDaemon("deck.readPptx", { path: filePath }),
    );
    if (parsed.flags.has("json")) printResult(outline, parsed);
    else process.stdout.write(outline.markdown);
    return true;
  }

  if (action === "delete") {
    const id = requiredId(args, "delete");
    const expectedRevision = (await requireDeck(id)).revision;
    await withDaemon(() =>
      requestDaemon("deck.delete", { id, expectedRevision }),
    );
    printResult({ id, deleted: true }, parsed);
    return true;
  }

  if (action === "check") {
    const id = requiredId(args, "check");
    printResult(
      await withDaemon(() => requestDaemon("deck.check", { id })),
      parsed,
    );
    return true;
  }

  if (action === "export") {
    const id = requiredId(args, "export");
    const outputPath = path.resolve(getRequiredFlag(parsed, "output"));
    const format = exportFormat(stringFlag(parsed, "format"), outputPath);
    printResult(
      await withDaemon(() =>
        requestDaemon("deck.exportFile", { id, format, outputPath }),
      ),
      parsed,
    );
    return true;
  }

  return false;
}

function exportFormat(
  flag: string | undefined,
  outputPath: string,
): DeckExportFormat {
  const value = flag ?? path.extname(outputPath).slice(1).toLowerCase();
  const format = DECK_EXPORT_FORMATS.find((candidate) => candidate === value);
  if (!format) {
    throw new Error(
      `--format must be one of: ${DECK_EXPORT_FORMATS.join(", ")}`,
    );
  }
  return format;
}

async function readInput(value: string) {
  return value === "-" ? readStdin() : readFile(value, "utf8");
}

async function readOps(file: string): Promise<DeckOp[]> {
  const value: unknown = JSON.parse(await readInput(file));
  const ops =
    value && typeof value === "object" && "ops" in value ? value.ops : value;
  if (!Array.isArray(ops)) {
    throw new Error(
      "--ops-file must hold a JSON array of ops or { ops: [...] }",
    );
  }
  return ops as DeckOp[];
}

async function readSource(parsed: ParsedArgs): Promise<DeckSource> {
  const markdownFile = stringFlag(parsed, "markdown-file");
  const contentFile = stringFlag(parsed, "content-file");
  if (markdownFile && contentFile) {
    throw new Error("Pass either --markdown-file or --content-file, not both");
  }
  if (markdownFile) {
    return { markdown: await readInput(markdownFile) };
  }
  if (contentFile) {
    return { content: JSON.parse(await readInput(contentFile)) as DeckContent };
  }
  return {};
}

async function requireDeck(id: string) {
  const deck = await withDaemon(() => requestDaemon("deck.get", { id }));
  if (!deck) {
    throw new Error(`Deck not found: ${id}`);
  }
  return deck;
}

function requiredId(args: string[], action: keyof typeof USAGE) {
  const [id] = args;
  if (!id) {
    throw new Error(`Usage: ${USAGE[action]}`);
  }
  return id;
}

function expectedRevisionFlag(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "expected-revision");
  if (value === undefined) return undefined;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("--expected-revision must be a positive integer");
  }
  return revision;
}
