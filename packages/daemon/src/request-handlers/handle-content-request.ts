import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";

const CONTENT_PREFIXES = ["note.", "link.", "deck.", "issue."] as const;

type ContentMethod = Extract<
  DaemonMethod,
  `${(typeof CONTENT_PREFIXES)[number]}${string}`
>;

export function isContentRequest(
  request: DaemonRequest,
): request is DaemonRequest<ContentMethod> {
  return CONTENT_PREFIXES.some((prefix) => request.method.startsWith(prefix));
}

export async function handleContentRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<ContentMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[ContentMethod]> {
  const data = service.dataService;
  switch (request.method) {
    case "note.list":
      return data.listNotes();
    case "note.get":
      return data.getNote(request.params);
    case "note.getDoc":
      return data.getNoteDoc(request.params);
    case "note.applyDocUpdate":
      return data.applyNoteDocUpdate(request.params);
    case "note.create":
      return data.createNote(request.params);
    case "note.update":
      return data.updateNote(request.params);
    case "note.move":
      return data.moveNote(request.params);
    case "note.delete":
      await data.deleteNote(request.params);
      return null;
    case "note.listTags":
      return data.listNoteTags(request.params.noteId);
    case "note.backlinks":
      return data.listNoteBacklinks(request.params);
    case "link.list":
      return data.listEntityLinks(request.params);
    case "link.candidates":
      return data.listEntityLinkCandidates();
    case "link.add":
      return data.addEntityLink(request.params);
    case "link.remove":
      return data.removeEntityLink(request.params);
    case "deck.list":
      return service.decks.list();
    case "deck.get":
      return service.decks.get(request.params);
    case "deck.create":
      return service.decks.create(request.params);
    case "deck.update":
      return service.decks.update(request.params);
    case "deck.edit":
      return service.decks.edit(request.params);
    case "deck.delete":
      await service.decks.delete(request.params);
      return null;
    case "deck.check":
      return service.decks.check(request.params);
    case "deck.createDownload":
      return service.decks.createDownload(request.params);
    case "deck.exportFile":
      await service.workspaces.assertClientPathAccess(
        context.principal,
        request.params.outputPath,
        "outputFile",
      );
      return service.decks.exportFile(request.params);
    case "deck.importImage":
      await service.workspaces.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.importImage(request.params);
    case "deck.import":
      await service.workspaces.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.importPptx(request.params);
    case "deck.readPptx":
      await service.workspaces.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.readPptx(request.params);
    case "issue.listViews":
      return data.listIssueViews();
    case "issue.loadView":
      return data.loadIssueView(request.params);
    case "issue.createView":
      return data.createIssueView(request.params);
    case "issue.updateView":
      return data.updateIssueView(request.params);
    case "issue.deleteView":
      await data.deleteIssueView(request.params);
      return null;
    case "issue.listColumns":
      return data.listIssueColumns(request.params);
    case "issue.createColumn":
      return data.createIssueColumn(request.params);
    case "issue.updateColumn":
      return data.updateIssueColumn(request.params);
    case "issue.moveColumn":
      return data.moveIssueColumn(request.params);
    case "issue.deleteColumn":
      await data.deleteIssueColumn(request.params);
      return null;
    case "issue.get":
      return data.getIssue(request.params);
    case "issue.create":
      return data.createIssue(request.params);
    case "issue.update":
      return data.updateIssue(request.params);
    case "issue.move":
      return data.moveIssue(request.params);
    case "issue.delete":
      await data.deleteIssue(request.params);
      return null;
    case "issue.getDetail":
      return data.getIssueDetail(request.params);
    case "issue.listLabels":
      return data.listIssueLabels();
    case "issue.createLabel":
      return data.createIssueLabel(request.params);
    case "issue.updateLabel":
      return data.updateIssueLabel(request.params);
    case "issue.deleteLabel":
      await data.deleteIssueLabel(request.params);
      return null;
    case "issue.addRelation":
      return data.addIssueRelation(request.params);
    case "issue.removeRelation":
      return data.removeIssueRelation(request.params);
    case "issue.comment":
      return data.commentIssue(request.params);
    case "issue.linkSession":
      return data.linkIssueSession(request.params);
    case "issue.listLinkedSessionIds":
      return data.listIssueLinkedSessionIds();
  }
}
