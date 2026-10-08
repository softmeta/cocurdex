import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { readStdin } from "./read-stdin";

export async function handleNoteCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list") {
    const notes = await withDaemon(() => requestDaemon("note.list"));
    printRows(notes, ["id", "kind", "title", "updatedAt"], parsed);
    return true;
  }

  if (action === "show") {
    const id = requiredId(args, "show");
    printResult(
      await withDaemon(() => requestDaemon("note.get", { id })),
      parsed,
    );
    return true;
  }

  if (action === "create") {
    const isFolder = parsed.flags.has("folder");
    const bodyMarkdown = isFolder ? undefined : await readBody(parsed);
    const note = await withDaemon(() =>
      requestDaemon("note.create", {
        title: getRequiredFlag(parsed, "title"),
        kind: isFolder ? "folder" : "note",
        parentId: stringFlag(parsed, "parent") ?? null,
        workspaceId: stringFlag(parsed, "workspace") ?? null,
        bodyMarkdown,
      }),
    );
    printResult(note, parsed);
    return true;
  }

  if (action === "update") {
    const id = requiredId(args, "update");
    const expectedRevision =
      expectedRevisionFlag(parsed) ?? (await currentRevision(id));
    const bodyMarkdown = await readBody(parsed);
    const updated = await withDaemon(() =>
      requestDaemon("note.update", {
        id,
        title: stringFlag(parsed, "title"),
        bodyMarkdown,
        expectedRevision,
      }),
    );
    printResult(updated, parsed);
    return true;
  }

  if (action === "move") {
    const id = requiredId(args, "move");
    const parentId = parsed.flags.has("root")
      ? null
      : stringFlag(parsed, "parent");
    if (parentId === undefined) {
      throw new Error(
        "Usage: cocurdex note move <id> --parent <folder-id> | --root",
      );
    }
    const current = await withDaemon(() => requestDaemon("note.get", { id }));
    if (!current) {
      throw new Error(`Note not found: ${id}`);
    }
    printResult(
      await withDaemon(() =>
        requestDaemon("note.move", {
          id,
          parentId,
          expectedRevision: current.revision,
        }),
      ),
      parsed,
    );
    return true;
  }

  if (action === "delete") {
    const id = requiredId(args, "delete");
    const current = await withDaemon(() => requestDaemon("note.get", { id }));
    if (!current) {
      throw new Error(`Note not found: ${id}`);
    }
    await withDaemon(() =>
      requestDaemon("note.delete", {
        id,
        expectedRevision: current.revision,
      }),
    );
    printResult({ id, deleted: true }, parsed);
    return true;
  }

  if (action === "backlinks") {
    const id = requiredId(args, "backlinks");
    printResult(
      await withDaemon(() => requestDaemon("note.backlinks", { id })),
      parsed,
    );
    return true;
  }

  if (action === "tags") {
    printResult(
      await withDaemon(() =>
        requestDaemon("note.listTags", { noteId: args[0] }),
      ),
      parsed,
    );
    return true;
  }

  return false;
}

async function readBody(parsed: ParsedArgs): Promise<string | undefined> {
  const bodyFile = stringFlag(parsed, "body-file");
  if (bodyFile) {
    return readFile(bodyFile, "utf8");
  }
  const body = stringFlag(parsed, "body");
  return body === "-" ? readStdin() : body;
}

function requiredId(args: string[], action: string) {
  const [id] = args;
  if (!id) {
    throw new Error(`Usage: cocurdex note ${action} <id>`);
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

async function currentRevision(id: string) {
  const current = await withDaemon(() => requestDaemon("note.get", { id }));
  if (!current) {
    throw new Error(`Note not found: ${id}`);
  }
  return current.revision;
}
