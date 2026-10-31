import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  buildDaemonAttachmentUploadUrl,
  buildHostPairingLink,
  entityUri,
  type ImageAttachment,
} from "@cocurdex/shared";
import type { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { installFixtureDb } from "@cocurdex/test-harness/fixture-db/install";
import { FIXTURE_WORKSPACE_ID } from "@cocurdex/test-harness/fixture-db/recipe";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  bundledDaemonPath,
  daemonLogTail,
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { EMULATOR_HOST_ALIAS } from "./android";
import type { MobilePlatform } from "./target";

const AGENT_MODEL_ID = "e2e-agent-model";
const AGENT_MODEL_NAME = "E2E Agent Model";
const STUB_REQUEST_TAIL = 6;
const DAEMON_LOG_TAIL = 150;
const IMAGE_FIXTURE = createRequire(import.meta.url).resolve(
  "@cocurdex/test-harness/fixtures/doc-images/checkout-screenshot.png",
);

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

async function uploadImage(
  metadata: { webSocketUrl: string; token: string },
  file: string,
) {
  const uploaded = await fetch(
    buildDaemonAttachmentUploadUrl(
      metadata.webSocketUrl,
      "image",
      path.basename(file),
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${metadata.token}`,
        "content-type": "image/png",
      },
      body: await readFile(file),
    },
  );
  if (uploaded.status !== 201) {
    throw new Error(`Image upload failed: ${uploaded.status}`);
  }
  return (await uploaded.json()) as ImageAttachment;
}

async function pointWorkspacesAtFixtures(
  options: Parameters<typeof requestDaemon>[2],
  fixture: Awaited<ReturnType<typeof installFixtureDb>>,
) {
  const saved = await requestDaemon("workspace.list", options);
  for (const installed of fixture.installedWorkspaces) {
    const workspace = saved.find((entry) => entry.id === installed.id);
    if (!workspace) continue;
    const rootPaths = await Promise.all(
      installed.rootPaths.map((rootPath) => realpath(rootPath)),
    );
    await requestDaemon(
      "workspace.save",
      { workspace: { ...workspace, rootPaths } },
      options,
    );
  }
}

const STREAM_CHUNK_SIZES = [1, 2, 1, 0, 0, 18, 3, 0, 24, 2];
const STREAM_CHUNK_INTERVAL_MS = 60;

function streamedChunks(reply: string) {
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      reply,
    ),
  ].map(({ segment }) => segment);
  const chunks: string[] = [];
  let at = 0;
  while (at < graphemes.length) {
    const size =
      STREAM_CHUNK_SIZES[chunks.length % STREAM_CHUNK_SIZES.length] ?? 1;
    chunks.push(graphemes.slice(at, at + size).join(""));
    at += size;
  }
  return chunks;
}

export async function startPairingDaemon(
  platform: MobilePlatform,
  tempDirs: ReturnType<typeof createTempDirs>,
  fixtureDbDir?: string,
) {
  if (!existsSync(bundledDaemonPath)) {
    throw new Error(`Missing ${bundledDaemonPath}; run with --build first`);
  }
  const root = tempDirs.createSync("cocu-m-");
  const userDataPath = path.join(root, "data");
  const fixture = await installFixtureDb({
    userDataPath,
    workspaceParent: path.join(root, "ws"),
    builtDir: fixtureDbDir,
  });
  const daemon = await spawnDaemon({ entry: "bundled", userDataPath });
  const stub = await startStubLlmServer();
  try {
    await pointWorkspacesAtFixtures(daemon.options, fixture);
    const providerSnapshot = await saveStubProvider(daemon, stub);
    const now = new Date().toISOString();
    await requestDaemon(
      "provider.model.save",
      {
        model: {
          providerId: providerSnapshot.providerId,
          modelId: AGENT_MODEL_ID,
          name: AGENT_MODEL_NAME,
          api: "openai-completions",
          enabled: true,
          source: "manual",
          capabilities: ["chat", "agent"],
          createdAt: now,
          updatedAt: now,
        },
      },
      daemon.options,
    );
    const port = await freePort();
    const status = await requestDaemon(
      "host.remoteAccess.set",
      { enabled: true, port },
      daemon.options,
    );
    if (!status.listening) {
      throw new Error(`Remote access did not start: ${status.error}`);
    }
    const address =
      status.addresses.find((candidate) => candidate.kind === "lan") ??
      status.addresses[0];
    if (!address) throw new Error("Remote access reported no address");
    const baseUrl = new URL(address.url);
    if (platform === "android") baseUrl.hostname = EMULATOR_HOST_ALIAS;
    return {
      hostAddress: baseUrl.host,
      async createPairingLink() {
        const { code, hostKey } = await requestDaemon(
          "host.pairing.create",
          {
            label: "Mobile e2e",
            scopes: ["read", "files.read", "interact", "execute"],
          },
          daemon.options,
        );
        return buildHostPairingLink(baseUrl.origin, code, hostKey);
      },
      agentModelName: AGENT_MODEL_NAME,
      agentModelId: AGENT_MODEL_ID,
      sessions: () => requestDaemon("session.list", daemon.options),
      async pairedDevices() {
        const devices = await requestDaemon(
          "host.devices.list",
          daemon.options,
        );
        return devices.filter((device) => device.revokedAt === null);
      },
      sessionAttention: () => requestDaemon("attention.list", daemon.options),
      async createReplyingSession(title: string, reply: string) {
        stub.plan = {
          kind: "stream",
          chunks: streamedChunks(reply),
          intervalMs: STREAM_CHUNK_INTERVAL_MS,
        };
        return requestDaemon(
          "session.configure",
          {
            id: crypto.randomUUID(),
            workspaceId: FIXTURE_WORKSPACE_ID,
            sessionKind: "main",
            title,
            agentType: "pi",
            writeMode: "read-only",
            sessionModeId: null,
            providerSnapshot,
          },
          daemon.options,
        );
      },
      async createImageSession(title: string, prompt: string, reply: string) {
        const attachment = await uploadImage(daemon.metadata, IMAGE_FIXTURE);
        stub.plan = { kind: "stream", chunks: [reply] };
        const answered = stub.requests.length;
        const session = await requestDaemon(
          "session.configure",
          {
            id: crypto.randomUUID(),
            workspaceId: FIXTURE_WORKSPACE_ID,
            sessionKind: "main",
            title,
            agentType: "pi",
            writeMode: "read-only",
            sessionModeId: null,
            providerSnapshot,
          },
          daemon.options,
        );
        await requestDaemon(
          "session.send",
          {
            sessionId: session.id,
            messageId: crypto.randomUUID(),
            content: prompt,
            attachments: [attachment],
          },
          daemon.options,
        );
        await waitFor(() => stub.requests.length > answered, 30_000);
        return session;
      },
      async createNoteLinkingIssue(noteTitle: string, issueTitle: string) {
        const view = await requestDaemon("issue.loadView", {}, daemon.options);
        const issue = view?.issues.find(
          (candidate) => candidate.title === issueTitle,
        );
        if (!issue) throw new Error(`Fixture issue ${issueTitle} is missing`);
        const linkText = `${issue.identifier} ${issue.title}`;
        await requestDaemon(
          "note.create",
          {
            title: noteTitle,
            workspaceId: FIXTURE_WORKSPACE_ID,
            bodyMarkdown: `[${linkText}](${entityUri({ kind: "issue", id: issue.id })})`,
          },
          daemon.options,
        );
        return linkText;
      },
      sentPrompts: () =>
        stub.requests.map((request) => JSON.stringify(request.body.messages)),
      async diagnostics() {
        const sessions = await requestDaemon(
          "session.list",
          daemon.options,
        ).catch((error: unknown) => `session.list failed: ${String(error)}`);
        const sessionLines = Array.isArray(sessions)
          ? sessions.map(
              (session) =>
                `${session.id} ${session.status} ${session.agentType} ${session.title}`,
            )
          : [sessions];
        const requestLines = stub.requests
          .slice(-STUB_REQUEST_TAIL)
          .map((request) => JSON.stringify(request.body.messages).slice(-300));
        return [
          "--- daemon sessions",
          ...sessionLines,
          `--- llm stub requests (${stub.requests.length} total, last ${STUB_REQUEST_TAIL})`,
          ...requestLines,
          "--- daemon log",
          await daemonLogTail(daemon.userDataPath, DAEMON_LOG_TAIL),
        ].join("\n");
      },
      async dispose() {
        await daemon.dispose();
        await stub.close();
      },
    };
  } catch (error) {
    await daemon.dispose();
    await stub.close();
    throw error;
  }
}
