import type { EventEmitter } from "node:events";
import { decodeNoteDocBytes, encodeNoteDocBytes } from "@cocurdex/note-doc";
import {
  type ApplyNoteDocUpdatePayload,
  type CommentIssuePayload,
  type CreateColumnPayload,
  type CreateIssueLabelPayload,
  type CreateIssuePayload,
  type CreateNotePayload,
  type CreateViewPayload,
  type DeleteColumnPayload,
  type DeleteIssueLabelPayload,
  type DeleteIssuePayload,
  type DeleteNotePayload,
  type DeleteViewPayload,
  type EntityLinkPayload,
  type EntityRef,
  type GetIssueDetailPayload,
  type GetIssuePayload,
  type GetNoteDocPayload,
  type GetNotePayload,
  type IssueRelationPayload,
  isContextItemAttachment,
  isLinkableEntityKind,
  type LinkIssueSessionPayload,
  type ListEntityLinksPayload,
  type LoadViewPayload,
  type MessageAttachment,
  type MoveColumnPayload,
  type MoveIssuePayload,
  type MoveNotePayload,
  type NoteBacklinksPayload,
  type NoteDocSnapshot,
  type SearchDocumentsPayload,
  sameEntity,
  type UpdateColumnPayload,
  type UpdateIssueLabelPayload,
  type UpdateIssuePayload,
  type UpdateNotePayload,
  type UpdateViewPayload,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";
import type { DaemonState } from "./state";

export class DaemonDataService {
  constructor(
    private readonly state: DaemonState,
    private readonly events: EventEmitter,
  ) {}

  listNotes() {
    return this.state.data.notes.list();
  }

  getNote(payload: GetNotePayload) {
    return this.state.data.notes.get(payload.id);
  }

  async getNoteDoc(
    payload: GetNoteDocPayload,
  ): Promise<NoteDocSnapshot | null> {
    const doc = await this.state.data.notes.getDoc(
      payload.id,
      payload.stateVector ? decodeNoteDocBytes(payload.stateVector) : undefined,
    );
    return doc
      ? {
          id: doc.id,
          revision: doc.revision,
          update: encodeNoteDocBytes(doc.update),
        }
      : null;
  }

  async applyNoteDocUpdate(payload: ApplyNoteDocUpdatePayload) {
    const { note, changed } = await this.state.data.notes.applyDocUpdate({
      id: payload.id,
      update: decodeNoteDocBytes(payload.update),
    });
    if (changed) {
      this.emitChanged("notes");
    }
    return note;
  }

  async createNote(payload: CreateNotePayload) {
    const note = await this.state.data.notes.create(payload);
    this.emitChanged("notes");
    return note;
  }

  async updateNote(payload: UpdateNotePayload) {
    const note = await this.state.data.notes.update(payload);
    this.emitChanged("notes");
    return note;
  }

  async moveNote(payload: MoveNotePayload) {
    const note = await this.state.data.notes.move(payload);
    this.emitChanged("notes");
    return note;
  }

  async deleteNote(payload: DeleteNotePayload) {
    await this.state.data.notes.delete(payload);
    this.emitChanged("notes");
  }

  listNoteTags(noteId?: string) {
    return this.state.data.notes.listTags(noteId);
  }

  listNoteBacklinks(payload: NoteBacklinksPayload) {
    return this.state.data.notes.listBacklinks(payload);
  }

  listIssueViews() {
    return this.state.data.issues.listViews();
  }

  loadIssueView(payload: LoadViewPayload) {
    return this.state.data.issues.loadView(payload);
  }

  async createIssueView(payload: CreateViewPayload) {
    const view = await this.state.data.issues.createView(payload);
    this.emitChanged("issues");
    return view;
  }

  async updateIssueView(payload: UpdateViewPayload) {
    const view = await this.state.data.issues.updateView(payload);
    this.emitChanged("issues");
    return view;
  }

  async deleteIssueView(payload: DeleteViewPayload) {
    await this.state.data.issues.deleteView(payload);
    this.emitChanged("issues");
  }

  async createIssueColumn(payload: CreateColumnPayload) {
    const column = await this.state.data.issues.createColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async updateIssueColumn(payload: UpdateColumnPayload) {
    const column = await this.state.data.issues.updateColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async moveIssueColumn(payload: MoveColumnPayload) {
    const column = await this.state.data.issues.moveColumn(payload);
    this.emitChanged("issues");
    return column;
  }

  async deleteIssueColumn(payload: DeleteColumnPayload) {
    await this.state.data.issues.deleteColumn(payload);
    this.emitChanged("issues");
  }

  getIssue(payload: GetIssuePayload) {
    return this.state.data.issues.getIssue(payload);
  }

  async createIssue(payload: CreateIssuePayload) {
    const issue = await this.state.data.issues.createIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async updateIssue(payload: UpdateIssuePayload) {
    const issue = await this.state.data.issues.updateIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async moveIssue(payload: MoveIssuePayload) {
    const issue = await this.state.data.issues.moveIssue(payload);
    this.emitChanged("issues");
    return issue;
  }

  async deleteIssue(payload: DeleteIssuePayload) {
    await this.state.data.issues.deleteIssue(payload);
    this.emitChanged("issues");
  }

  getIssueDetail(payload: GetIssueDetailPayload) {
    return this.state.data.issues.getIssueDetail(payload);
  }

  listIssueLabels() {
    return this.state.data.issues.listLabels();
  }

  async createIssueLabel(payload: CreateIssueLabelPayload) {
    const label = await this.state.data.issues.createLabel(payload);
    this.emitChanged("issues");
    return label;
  }

  async updateIssueLabel(payload: UpdateIssueLabelPayload) {
    const label = await this.state.data.issues.updateLabel(payload);
    this.emitChanged("issues");
    return label;
  }

  async deleteIssueLabel(payload: DeleteIssueLabelPayload) {
    await this.state.data.issues.deleteLabel(payload);
    this.emitChanged("issues");
  }

  async addIssueRelation(payload: IssueRelationPayload) {
    const detail = await this.state.data.issues.addRelation(payload);
    this.emitChanged("issues");
    return detail;
  }

  async removeIssueRelation(payload: IssueRelationPayload) {
    const detail = await this.state.data.issues.removeRelation(payload);
    this.emitChanged("issues");
    return detail;
  }

  async commentIssue(payload: CommentIssuePayload) {
    const detail = await this.state.data.issues.comment(payload);
    this.emitChanged("issues");
    return detail;
  }

  async linkIssueSession(payload: LinkIssueSessionPayload) {
    const linked = await this.state.data.issues.linkSession(payload);
    if (linked) {
      this.emitChanged("issues");
    }
    return linked;
  }

  listIssueLinkedSessionIds() {
    return this.state.data.issues.listLinkedSessionIds();
  }

  async linkAttachedIssues(
    sessionId: string,
    attachments: readonly MessageAttachment[] | undefined,
  ) {
    const issueIds = new Set(
      (attachments ?? [])
        .filter(isContextItemAttachment)
        .filter((attachment) => attachment.itemKind === "issue")
        .map((attachment) => attachment.id),
    );
    let linked = false;
    for (const id of issueIds) {
      try {
        linked =
          (await this.state.data.issues.linkSession({ id, sessionId })) ||
          linked;
      } catch (error) {
        logDaemonDiagnostic("warn", "issue.sessionLinkSkipped", {
          issueId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (linked) {
      this.emitChanged("issues");
    }
  }

  async listEntityLinks(payload: ListEntityLinksPayload) {
    const ref = await this.requireEntity(payload.ref);
    return this.state.data.entityLinks.list(ref);
  }

  listEntityLinkCandidates() {
    return this.state.data.entityLinks.candidates();
  }

  async addEntityLink(payload: EntityLinkPayload) {
    const [source, target] = await this.requireLinkPair(payload);
    const added = await this.state.data.entityLinks.add(source, target);
    if (added) this.emitChanged("links");
    return added;
  }

  async removeEntityLink(payload: EntityLinkPayload) {
    const [source, target] = await this.requireLinkPair(payload);
    const removed = await this.state.data.entityLinks.remove(source, target);
    if (removed) this.emitChanged("links");
    return removed;
  }

  private async requireEntity(ref: EntityRef): Promise<EntityRef> {
    if (!isLinkableEntityKind(ref?.kind) || typeof ref.id !== "string") {
      throw new Error("Invalid entity reference");
    }
    const resolved = await this.state.data.entityLinks.resolve(ref);
    if (!resolved) {
      throw new Error(`${ref.kind} not found: ${ref.id}`);
    }
    return resolved;
  }

  private async requireLinkPair(
    payload: EntityLinkPayload,
  ): Promise<[EntityRef, EntityRef]> {
    const source = await this.requireEntity(payload.source);
    const target = await this.requireEntity(payload.target);
    if (sameEntity(source, target)) {
      throw new Error("An entity cannot link to itself");
    }
    return [source, target];
  }

  searchDocuments(payload: SearchDocumentsPayload) {
    return this.state.data.search.search(payload);
  }

  private emitChanged(area: "issues" | "links" | "notes"): void {
    this.events.emit("daemon.event", {
      type: "data.changed",
      areas: [area],
    });
  }
}
