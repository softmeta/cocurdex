import { randomUUID } from "node:crypto";
import type {
  AgentSession,
  CreateAgentSessionPayload,
  SendAgentMessagePayload,
} from "@cocurdex/agent-core";
import type { AgentEvent, MessageRecord } from "@cocurdex/shared";
import {
  errorKindForLog,
  hashLogValue,
  isChatSession,
  piThinkingLevels,
} from "@cocurdex/shared";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
  type AgentChange,
  AgentDoc,
  type Conversation,
  ConversationIdle,
  type ConversationWatch,
  type EntryId,
  type EntryRecord,
  type Extension,
  type LiveState,
  type SubmissionRecord,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { logAdapterDiagnostic } from "../diagnostics";
import { readPiSessionFile } from "../pi-sdk/pi-session-fork";
import {
  assertNoDocumentAttachments,
  buildTextWithContextAttachments,
  logOutgoingPromptForDiagnostics,
  readImageAttachmentBase64,
  splitAttachments,
} from "../shared";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "../shared/session-recovery";
import { emitNativeWorkspaceEvidence } from "../workspace-changes/native-evidence";
import {
  bindConversation,
  newestEntryId,
  openBoundConversation,
  providerSessionRecord,
  readDurableConversation,
  readEntriesFrom,
} from "./durable-conversations";
import { CocurdexRunDoc, runPolicyState } from "./durable-docs";
import { importPiContext, readPiSessionContext } from "./durable-history";
import { type DurableHost, getDurableHost } from "./durable-host";
import { DurableProjector } from "./durable-projection";
import { expandSkillCommand } from "./durable-resources";

const POSTED_ENTRY_KIND = "cocurdex.posted";

type ThinkingLevel = (typeof piThinkingLevels)[number];

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return piThinkingLevels.includes(value as ThinkingLevel);
}

function userText(text: string) {
  return { role: "user" as const, content: text, timestamp: Date.now() };
}

function failureMessage(record: SubmissionRecord) {
  if (record.status !== "unanswered") return null;
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (record.reason === "aborted") return "Request aborted";
  if (record.reason === "no_model") return "The model is not available";
  return `The run ended without an answer (${record.reason})`;
}

/**
 * An assistant or chat session on the durable pi harness. Each Cocurdex session is one durable
 * conversation; a turn is one input submission keyed by the Cocurdex message ID, so sending the
 * same message again after a daemon restart attaches to the run the Harness resumed instead of
 * starting another one.
 */
export function createDurablePiSession(
  payload: CreateAgentSessionPayload,
  onEvent: (event: AgentEvent) => void,
): AgentSession {
  const sessionId = payload.session.id;
  const chat = isChatSession(payload.session);
  const host: DurableHost = getDurableHost(payload.userDataPath);
  const persisted = payload.providerSession?.providerStateJson ?? null;
  const persistedRef = persisted ? readDurableConversation(persisted) : null;
  const legacySessionFile =
    persisted && persistedRef === null ? readPiSessionFile(persisted) : null;
  let conversationPromise: Promise<Conversation> | null = null;
  let conversation: Conversation | null = null;
  let projector: DurableProjector | null = null;
  let disposed = false;
  let stopRequested = false;
  let lastUserMessageId: string | null = null;
  const watches = new Set<ConversationWatch>();

  function emitError(message: string) {
    if (disposed) return;
    onEvent({ type: "error", sessionId, message });
    onEvent({ type: "state.changed", sessionId, status: "error" });
  }

  function emit(event: AgentEvent) {
    if (!disposed) onEvent(event);
  }

  async function createConversation() {
    const harness = await host.harness();
    const created = await harness.createConversation(
      { ownership: { kind: "ownerless" } },
      BACKGROUND_CONTEXT,
    );
    if (legacySessionFile) {
      const messages = readPiSessionContext(
        legacySessionFile,
        host.agentDir,
        payload.workspaceRootPath,
      );
      await importPiContext(created, messages);
      logAdapterDiagnostic("info", "pi-durable: imported pi session", {
        sessionId,
        messageCount: messages.length,
        sessionFileHash: hashLogValue(legacySessionFile),
      });
    }
    const ref = await bindConversation(created);
    payload.onProviderSessionUpdate?.(providerSessionRecord(sessionId, ref));
    return { conversation: created, key: ref.key };
  }

  async function openConversation() {
    const harness = await host.harness();
    const existing = persistedRef
      ? await openBoundConversation(harness, persistedRef)
      : undefined;
    if (persistedRef && !existing) {
      logAdapterDiagnostic("info", "pi-durable: stored conversation is gone", {
        sessionId,
      });
    }
    const bound =
      existing && persistedRef
        ? { conversation: existing, key: persistedRef.key }
        : await createConversation();
    const opened = bound.conversation;
    conversation = opened;
    projector = new DurableProjector(sessionId, bound.key, emit, (files) =>
      emitNativeWorkspaceEvidence(onEvent, sessionId, lastUserMessageId, {
        source: "pi-tool-patch",
        coverage: "tool-call",
        files,
      }),
    );
    if (payload.agentToolInvoker && !chat) {
      const added = await host.agentTools.bind(
        opened.id,
        payload.agentToolInvoker,
      );
      if (added) host.refreshAgentTools();
    }
    return opened;
  }

  function getConversation() {
    conversationPromise ??= openConversation();
    return conversationPromise;
  }

  function extensionsFor(cwd: string): Extension[] {
    if (chat) return host.extensions.chat;
    const extra = [
      host.agentToolsExtension(),
      ...host.mcp.ensure(cwd).map((name) => host.extensionByName(name)),
    ].filter((extension): extension is Extension => extension !== undefined);
    return [...host.extensions.assistant, ...extra];
  }

  async function configure(
    target: Conversation,
    messagePayload: SendAgentMessagePayload,
  ) {
    const providerConfig =
      messagePayload.providerConfig ?? payload.providerConfig;
    if (!providerConfig) {
      throw new Error("Pi requires a configured provider and model");
    }
    const model = await host.prepareModel(providerConfig);
    const cwd = payload.workspaceRootPath;
    if (!chat) await host.resources.refresh(cwd);
    const thinkingLevel = isThinkingLevel(messagePayload.thinkingLevel)
      ? messagePayload.thinkingLevel
      : undefined;
    await target.configure(
      {
        model,
        thinkingLevel,
        extensions: extensionsFor(cwd),
        cwd,
        modelTools: await modelToolsFor(target, messagePayload),
      },
      BACKGROUND_CONTEXT,
    );
    const allowed = messagePayload.runPolicy?.allowedTools;
    if (allowed && messagePayload.delivery !== "steer-active-run") {
      const agent = await target.agent(BACKGROUND_CONTEXT);
      const offered = agent.callable.filter((tool: ToolRegistration) =>
        allowed.includes(tool.name),
      );
      await target.configure({ modelTools: offered }, BACKGROUND_CONTEXT);
    }
  }

  /**
   * Keeps the tools `tool_search` loaded offered across turns; only clears the exact list a
   * previous run policy left, which `configure` then replaces when this turn has a policy too.
   * Steering keeps whatever the active run offers.
   */
  async function modelToolsFor(
    target: Conversation,
    messagePayload: SendAgentMessagePayload,
  ): Promise<AgentChange["modelTools"]> {
    if (messagePayload.delivery === "steer-active-run") return undefined;
    const stored = await target.commit(
      async (tx) => (await tx.doc(AgentDoc, target.id)).modelTools,
      BACKGROUND_CONTEXT,
    );
    return Array.isArray(stored) ? null : undefined;
  }

  async function writePosted(
    target: Conversation,
    messageId: string,
    posted: readonly string[],
  ) {
    for (const [index, content] of posted.entries()) {
      await target.submit(
        {
          type: "write",
          requestId: `${messageId}:posted:${index}`,
          entry: { kind: POSTED_ENTRY_KIND, model: [userText(content)] },
        },
        BACKGROUND_CONTEXT,
      );
    }
  }

  function buildInput(messagePayload: SendAgentMessagePayload, skills: string) {
    const attachments = messagePayload.attachments ?? [];
    assertNoDocumentAttachments("Pi", attachments);
    const { images } = splitAttachments(attachments);
    const prompt = buildTextWithContextAttachments(skills, attachments, {
      includeImageSummaries: false,
    });
    logOutgoingPromptForDiagnostics({
      agentId: "pi",
      attachments,
      history: messagePayload.history,
      prompt,
      sessionId,
    });
    if (images.length === 0) return prompt;
    const parts: (TextContent | ImageContent)[] = [
      { type: "text", text: prompt },
      ...images.map(
        (attachment): ImageContent => ({
          type: "image",
          data: readImageAttachmentBase64(attachment),
          mimeType: attachment.mimeType,
        }),
      ),
    ];
    return parts;
  }

  async function expandedContent(content: string) {
    if (chat || !content.startsWith("/skill:")) return content;
    const { skills } = await host.resources.get(payload.workspaceRootPath);
    return expandSkillCommand(content, skills);
  }

  /** Admits the input with its run state in one commit; returns the submission's ID. */
  async function admit(
    target: Conversation,
    messageId: string,
    messagePayload: SendAgentMessagePayload,
    content: Awaited<ReturnType<typeof buildInput>>,
    whenBusy: "steer" | undefined,
    resumed: boolean,
  ) {
    const steering = messagePayload.delivery === "steer-active-run";
    return target.commit(async (tx) => {
      const id = await target.submit(tx, {
        type: "input",
        requestId: messageId,
        content,
        whenBusy,
        whenIdle: steering ? "reject" : undefined,
      });
      if (resumed) return id;
      const run = await tx.doc(CocurdexRunDoc, target.id);
      if (messagePayload.systemSections) {
        run.sections = { ...messagePayload.systemSections };
      }
      run.workspaceRoots = [...(payload.workspaceRootPaths ?? [])];
      if (!steering) run.policy = runPolicyState(messagePayload.runPolicy);
      return id;
    }, BACKGROUND_CONTEXT);
  }

  async function follow(
    target: Conversation,
    turnProjector: DurableProjector,
    floor: EntryId,
  ) {
    let seen = (floor as number) - 1;
    const apply = (entries: readonly EntryRecord[]) => {
      for (const entry of entries) {
        if ((entry.id as number) < (floor as number)) continue;
        turnProjector.applyEntry(entry);
        seen = Math.max(seen, entry.id as number);
      }
    };
    const watch = await target.watch(BACKGROUND_CONTEXT, { from: floor });
    watches.add(watch);
    watch.start(async (call) => {
      if (call.kind !== "value" || disposed) return;
      const view = call.value;
      if (view.before !== undefined && (view.before as number) > seen) {
        await readEntriesFrom(target, (seen + 1) as EntryId, apply);
      }
      apply(view.entries);
      turnProjector.applyLive(view.docs["pi.live"] as LiveState | undefined);
    });
    return {
      async finish() {
        watches.delete(watch);
        await watch.stop();
        await readEntriesFrom(target, floor, apply);
      },
    };
  }

  async function runTurn(
    messagePayload: SendAgentMessagePayload,
    accepted: MessageRecord,
  ): Promise<MessageRecord> {
    const target = await getConversation();
    const turnProjector = projector as DurableProjector;
    const messageId = accepted.id;
    const prior = await target.commit(
      (tx) => tx.submissionByRequest(target.id, messageId),
      BACKGROUND_CONTEXT,
    );
    await configure(target, messagePayload);
    const steering = messagePayload.delivery === "steer-active-run";
    if (!prior) {
      await writePosted(target, messageId, messagePayload.postedMessages ?? []);
    }
    const content = buildInput(
      messagePayload,
      await expandedContent(messagePayload.content),
    );
    const baseline = await newestEntryId(target);
    let submissionId: Awaited<ReturnType<typeof admit>>;
    try {
      submissionId = await admit(
        target,
        messageId,
        messagePayload,
        content,
        steering ? "steer" : undefined,
        prior !== undefined,
      );
    } catch (error) {
      if (!(steering && error instanceof ConversationIdle)) throw error;
      submissionId = await admit(
        target,
        messageId,
        { ...messagePayload, delivery: undefined },
        content,
        undefined,
        false,
      );
      return awaitRun(target, turnProjector, submissionId, baseline);
    }
    if (steering) return accepted;
    if (prior?.status === "unanswered" && prior.reason === "no_model") {
      const retry = await target.submit(
        { type: "continue" },
        BACKGROUND_CONTEXT,
      );
      return awaitRun(target, turnProjector, retry.id, baseline, prior.entry);
    }
    if (prior?.status === "unanswered" && prior.reason === "aborted") {
      emit({ type: "state.changed", sessionId, status: "idle" });
      return turnProjector.response() ?? emptyResponse();
    }
    return awaitRun(target, turnProjector, submissionId, baseline);
  }

  async function awaitRun(
    target: Conversation,
    turnProjector: DurableProjector,
    submissionId: Awaited<ReturnType<typeof admit>>,
    baseline: EntryId | undefined,
    inputEntry?: EntryId,
  ): Promise<MessageRecord> {
    const harness = await host.harness();
    const submission = await harness.submission(
      submissionId,
      BACKGROUND_CONTEXT,
    );
    if (!submission) throw new Error("Durable submission was not found");
    const status = await submission.status(BACKGROUND_CONTEXT);
    const placed = inputEntry ?? status.entry;
    const floor = (placed ??
      (baseline === undefined ? 0 : (baseline as number) + 1)) as EntryId;
    turnProjector.beginTurn();
    const following = await follow(target, turnProjector, floor);
    let settled: SubmissionRecord;
    try {
      settled = await submission.wait(BACKGROUND_CONTEXT);
    } finally {
      await following.finish();
    }
    const response = turnProjector.response() ?? emptyResponse();
    const failure = failureMessage(settled);
    if (failure && !(settled.reason === "aborted" && stopRequested)) {
      logAdapterDiagnostic("info", "pi-durable: turn failed", {
        sessionId,
        messageId: lastUserMessageId,
        reason: settled.status === "unanswered" ? settled.reason : undefined,
        errorKind: errorKindForLog(failure),
      });
      emitError(failure);
      return response;
    }
    emit({ type: "state.changed", sessionId, status: "idle" });
    return response;
  }

  function emptyResponse(): MessageRecord {
    return {
      id: randomUUID(),
      sessionId,
      role: "assistant",
      kind: "response",
      content: "",
      attachments: [],
      createdAt: new Date().toISOString(),
    };
  }

  return {
    async sendMessage(messagePayload) {
      if (disposed) return emptyResponse();
      const accepted: MessageRecord = {
        id: messagePayload.messageId ?? randomUUID(),
        sessionId,
        role: "user",
        content: messagePayload.content.trim(),
        attachments: messagePayload.attachments ?? [],
        createdAt: new Date().toISOString(),
      };
      lastUserMessageId = accepted.id;
      if (messagePayload.delivery !== "steer-active-run") {
        stopRequested = false;
      }
      emit({ type: "state.changed", sessionId, status: "running" });
      try {
        if (
          !conversationPromise &&
          !persisted &&
          requiresNativeSessionRecovery(messagePayload.history)
        ) {
          throw createNativeSessionRecoveryError("Pi");
        }
        return await runTurn(messagePayload, accepted);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Pi durable turn failed";
        logAdapterDiagnostic("info", "pi-durable: turn threw", {
          sessionId,
          messageId: lastUserMessageId,
          errorKind: errorKindForLog(error),
          message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        emitError(message);
        return projector?.response() ?? emptyResponse();
      }
    },
    getWorkspaceChangeCapabilities() {
      return {
        turnDiff: "tool-level" as const,
        fileRewind: "none" as const,
        coverage: "tool-call" as const,
        conversationRevert: false,
      };
    },
    async collectNativeWorkspaceChanges() {
      const files = projector?.files() ?? [];
      if (files.length === 0) return null;
      return {
        source: "pi-tool-patch" as const,
        coverage: "tool-call" as const,
        files,
      };
    },
    resumesAfterRestart: true,
    stop() {
      stopRequested = true;
      void conversation?.abort(BACKGROUND_CONTEXT).catch((error) => {
        logAdapterDiagnostic("info", "pi-durable: abort failed", {
          sessionId,
          errorKind: errorKindForLog(error),
        });
      });
    },
    dispose() {
      disposed = true;
      for (const watch of watches) void watch.stop();
      watches.clear();
      if (conversation && payload.agentToolInvoker) {
        host.agentTools.unbind(conversation.id, payload.agentToolInvoker);
      }
    },
  };
}
