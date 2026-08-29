import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { protocol } from "electron";
import { createLogger } from "../logging";
import { parsePdfAssetUrl, resolvePdfReadPath } from "./pdf-read-service";

const logger = createLogger("pdf-protocol");

// The workspace roots are fetched per-request from main-process state so the
// authorization scope can never be influenced by the URL itself.
export function registerPdfProtocol(
  getWorkspaceRootPaths: () => Promise<string[]>,
) {
  protocol.handle("pdf-asset", async (request) => {
    try {
      const filePath = parsePdfAssetUrl(request.url);
      const workspaceRootPaths = await getWorkspaceRootPaths();
      const resolvedPath = resolvePdfReadPath(filePath, workspaceRootPaths);

      const stats = await stat(resolvedPath);
      const stream = createReadStream(resolvedPath);

      // Wrap Node readable stream into a Web ReadableStream for the Response.
      const readable = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
        cancel() {
          stream.destroy();
        },
      });

      return new Response(readable, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(stats.size),
          // pdf.js loads the custom scheme via XHR/fetch from the renderer
          // origin; Chromium requires an explicit ACAO on the response body.
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      logger.warn("pdf-asset.requestRejected", {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  });
}
