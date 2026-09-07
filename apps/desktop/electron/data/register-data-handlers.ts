import { requestDaemon } from "@cocurdex/daemon/client";
import type { IpcMain } from "electron";
import { registerHandler } from "../ipc";
import {
  createColumnPayloadSchema,
  createIssuePayloadSchema,
  createNotePayloadSchema,
  createViewPayloadSchema,
  deleteColumnPayloadSchema,
  deleteIssuePayloadSchema,
  deleteNotePayloadSchema,
  deleteViewPayloadSchema,
  getIssuePayloadSchema,
  getNotePayloadSchema,
  loadViewPayloadSchema,
  moveColumnPayloadSchema,
  moveIssuePayloadSchema,
  moveNotePayloadSchema,
  renameNotePayloadSchema,
  saveWorkflowDefinitionPayloadSchema,
  searchDocumentsPayloadSchema,
  updateColumnPayloadSchema,
  updateIssuePayloadSchema,
  updateNotePayloadSchema,
  updateViewPayloadSchema,
  workflowDefinitionIdPayloadSchema,
} from "./data-schemas";

export function registerDataHandlers(ipc: IpcMain, userDataPath: string): void {
  const options = { userDataPath };

  ipc.handle("notes:list", () => requestDaemon("note.list", options));
  registerHandler(ipc, "notes:get", getNotePayloadSchema, (_event, payload) =>
    requestDaemon("note.get", payload, options),
  );
  registerHandler(
    ipc,
    "notes:create",
    createNotePayloadSchema,
    (_event, payload) => requestDaemon("note.create", payload, options),
  );
  registerHandler(
    ipc,
    "notes:update",
    updateNotePayloadSchema,
    (_event, payload) => requestDaemon("note.update", payload, options),
  );
  registerHandler(
    ipc,
    "notes:rename",
    renameNotePayloadSchema,
    (_event, payload) => requestDaemon("note.update", payload, options),
  );
  registerHandler(ipc, "notes:move", moveNotePayloadSchema, (_event, payload) =>
    requestDaemon("note.move", payload, options),
  );
  registerHandler(
    ipc,
    "notes:delete",
    deleteNotePayloadSchema,
    async (_event, payload) => {
      await requestDaemon("note.delete", payload, options);
      return null;
    },
  );

  ipc.handle("issue:listViews", () =>
    requestDaemon("issue.listViews", options),
  );
  registerHandler(ipc, "issue:load", loadViewPayloadSchema, (_event, payload) =>
    requestDaemon("issue.loadView", payload, options),
  );
  registerHandler(ipc, "issue:get", getIssuePayloadSchema, (_event, payload) =>
    requestDaemon("issue.get", payload, options),
  );
  registerHandler(
    ipc,
    "issue:createView",
    createViewPayloadSchema,
    (_event, payload) => requestDaemon("issue.createView", payload, options),
  );
  registerHandler(
    ipc,
    "issue:updateView",
    updateViewPayloadSchema,
    (_event, payload) => requestDaemon("issue.updateView", payload, options),
  );
  registerHandler(
    ipc,
    "issue:deleteView",
    deleteViewPayloadSchema,
    async (_event, payload) => {
      await requestDaemon("issue.deleteView", payload, options);
      return null;
    },
  );
  registerHandler(
    ipc,
    "issue:createColumn",
    createColumnPayloadSchema,
    (_event, payload) => requestDaemon("issue.createColumn", payload, options),
  );
  registerHandler(
    ipc,
    "issue:updateColumn",
    updateColumnPayloadSchema,
    (_event, payload) => requestDaemon("issue.updateColumn", payload, options),
  );
  registerHandler(
    ipc,
    "issue:moveColumn",
    moveColumnPayloadSchema,
    (_event, payload) => requestDaemon("issue.moveColumn", payload, options),
  );
  registerHandler(
    ipc,
    "issue:deleteColumn",
    deleteColumnPayloadSchema,
    async (_event, payload) => {
      await requestDaemon("issue.deleteColumn", payload, options);
      return null;
    },
  );
  registerHandler(
    ipc,
    "issue:create",
    createIssuePayloadSchema,
    (_event, payload) => requestDaemon("issue.create", payload, options),
  );
  registerHandler(
    ipc,
    "issue:update",
    updateIssuePayloadSchema,
    (_event, payload) => requestDaemon("issue.update", payload, options),
  );
  registerHandler(
    ipc,
    "issue:move",
    moveIssuePayloadSchema,
    (_event, payload) => requestDaemon("issue.move", payload, options),
  );
  registerHandler(
    ipc,
    "issue:delete",
    deleteIssuePayloadSchema,
    async (_event, payload) => {
      await requestDaemon("issue.delete", payload, options);
      return null;
    },
  );

  registerHandler(
    ipc,
    "search:documents",
    searchDocumentsPayloadSchema,
    (_event, payload) => requestDaemon("search.documents", payload, options),
  );

  ipc.handle("workflow:listDefinitions", () =>
    requestDaemon("workflow.listDefinitions", options),
  );
  registerHandler(
    ipc,
    "workflow:getDefinition",
    workflowDefinitionIdPayloadSchema,
    (_event, payload) =>
      requestDaemon("workflow.getDefinition", payload, options),
  );
  registerHandler(
    ipc,
    "workflow:saveDefinition",
    saveWorkflowDefinitionPayloadSchema,
    (_event, payload) =>
      requestDaemon("workflow.saveDefinition", payload, options),
  );
  registerHandler(
    ipc,
    "workflow:duplicateDefinition",
    workflowDefinitionIdPayloadSchema,
    (_event, payload) =>
      requestDaemon("workflow.duplicateDefinition", payload, options),
  );
  registerHandler(
    ipc,
    "workflow:deleteDefinition",
    workflowDefinitionIdPayloadSchema,
    async (_event, payload) => {
      await requestDaemon("workflow.deleteDefinition", payload, options);
      return null;
    },
  );
}
