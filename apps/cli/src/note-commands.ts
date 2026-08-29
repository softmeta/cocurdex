import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import {
  getRequiredFlag,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

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
    const note = await withDaemon(() =>
      requestDaemon("note.create", {
        title: getRequiredFlag(parsed, "title"),
        kind: parsed.flags.has("folder") ? "folder" : "note",
        parentId: stringFlag(parsed, "parent") ?? null,
        workspaceId: stringFlag(parsed, "workspace") ?? null,
      }),
    );
    const bodyMarkdown = stringFlag(parsed, "body");
    const result =
      bodyMarkdown === undefined || note.kind === "folder"
        ? note
        : await withDaemon(() =>
            requestDaemon("note.update", {
              id: note.id,
              bodyMarkdown,
              expectedRevision: note.revision,
            }),
          );
    printResult(result, parsed);
    return true;
  }

  if (action === "update") {
    const id = requiredId(args, "update");
    const current = await withDaemon(() => requestDaemon("note.get", { id }));
    if (!current) {
      throw new Error(`Note not found: ${id}`);
    }
    const updated = await withDaemon(() =>
      requestDaemon("note.update", {
        id,
        title: stringFlag(parsed, "title"),
        bodyMarkdown: stringFlag(parsed, "body"),
        expectedRevision: current.revision,
      }),
    );
    printResult(updated, parsed);
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

function requiredId(args: string[], action: string) {
  const [id] = args;
  if (!id) {
    throw new Error(`Usage: cocurdex note ${action} <id>`);
  }
  return id;
}
