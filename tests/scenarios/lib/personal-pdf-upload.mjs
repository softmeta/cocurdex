import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PDF_FIXTURES } from "../fixtures/index.mjs";
import { check } from "./app-session.mjs";
import { daemonRequest } from "./daemon-rpc.mjs";
import { clickByRole } from "./locate.mjs";
import { showPanelView, translate } from "./navigate.mjs";

const require = createRequire(
  new URL("../../harness/package.json", import.meta.url),
);
const { tsImport } = await import(require.resolve("tsx/esm/api"));
const { buildDaemonAttachmentUploadUrl } = await tsImport(
  require.resolve("@cocurdex/shared"),
  import.meta.url,
);

async function waitForIdle(session, sessionId) {
  const deadline = Date.now() + 30_000;
  while (
    (await daemonRequest(session, "session.get", { sessionId }))?.status ===
    "running"
  ) {
    if (Date.now() >= deadline)
      throw new Error("Assistant turn did not finish before PDF verification");
    await delay(50);
  }
}

export function assistantManagedPdfStep(state, getStub) {
  return [
    "managed PDF uploads open from assistant files and retain annotations",
    async ({ session }) => {
      const connection = await session.run(() =>
        window.desktopApi.getDaemonConnection(),
      );
      const response = await fetch(
        buildDaemonAttachmentUploadUrl(
          connection.webSocketUrl,
          "document",
          "assistant-brief.pdf",
        ),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${connection.token}` },
          body: createReadStream(PDF_FIXTURES.sample.path),
          duplex: "half",
        },
      );
      check(response.ok, "managed PDF upload succeeded", {
        status: response.status,
      });
      const attachment = await response.json();
      await waitForIdle(session, state.homeSessionId);
      getStub().plan = {
        kind: "stream",
        chunks: ["The uploaded brief is ready."],
      };
      await daemonRequest(session, "session.send", {
        sessionId: state.homeSessionId,
        messageId: crypto.randomUUID(),
        content: "Keep this uploaded brief with our conversation",
        attachments: [
          {
            kind: "context-file",
            filePath: attachment.filePath,
            language: "",
            selectedText: "",
            startLine: 1,
            endLine: 1,
            surroundingContext: "",
            contentOmitted: true,
          },
        ],
      });
      await showPanelView(session, "files");
      const fileName = path.basename(attachment.filePath);
      await clickByRole(
        session,
        {
          role: "button",
          name: fileName,
          within: {
            role: "region",
            name: await translate(session, "editor:actions.conversationFiles"),
          },
        },
        30_000,
      );
      await session.waitUntil(
        () => document.querySelectorAll(".pdfViewer canvas").length > 0,
        null,
        30_000,
      );
      const bookmark = {
        id: "uploaded-preview",
        pageNumber: 1,
        createdAt: 1,
        label: "Uploaded brief",
      };
      await daemonRequest(session, "pdf.updateAnnotations", {
        filePath: attachment.filePath,
        operation: { type: "addBookmark", bookmark },
      });
      const annotations = await daemonRequest(session, "pdf.loadAnnotations", {
        filePath: attachment.filePath,
      });
      check(
        annotations.bookmarks.some((item) => item.id === bookmark.id),
        "managed PDF annotations persist",
      );
      await clickByRole(session, {
        role: "button",
        name: await translate(session, "editor:actions.closeFile", {
          fileName,
        }),
      });
      await waitForIdle(session, state.homeSessionId);
      return { previewed: true, bookmarkPersisted: true };
    },
  ];
}
