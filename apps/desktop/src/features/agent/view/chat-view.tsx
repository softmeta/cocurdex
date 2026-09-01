import type {
  AgentPermissionDecision,
  AgentQuestionRequestRecord,
  MessageAttachment,
  MessageRecord,
} from "@cocurdex/shared";
import {
  type CSSProperties,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from "@/components/ui";
import {
  ChatContentColumn,
  sessionComposerDraftKey,
} from "@/features/composer";
import {
  cn,
  isPerfEnabled,
  markSessionSwitch,
  measureSessionSwitch,
} from "@/lib";
import type { ToolCallPreviewLocation } from "../tool-call";
import { getActivityState } from "./chat-activity";
import { ChatConversationItem } from "./chat-conversation-item";
import { type StickyUserMessage, StickyUserMessageBar } from "./chat-message";
import { resolveJumpButton } from "./chat-scroll";
import { getCachedTranscriptModel } from "./chat-transcript-model";
import {
  type UserMessageAnchor,
  UserMessageNavigation,
} from "./chat-user-navigation";
import { ComposerDock, EmptyChatState, JumpControls } from "./chat-view-panels";
import type {
  ChatViewProps,
  PendingPreviousMessageSubmit,
  PreviousMessageRevertPreference,
} from "./chat-view-types";
import { useChatScrollState } from "./use-chat-scroll-state";
import { useChatViewPerfMarkers } from "./use-chat-view-perf-markers";
import { useStickyOverlayOffset } from "./use-sticky-overlay-offset";

const PREVIOUS_MESSAGE_REVERT_PREFERENCE_KEY =
  "agents.previousMessageRevertPreference";

export function ChatView({
  messages,
  permissionRequests = [],
  pendingPlanApproval = null,
  questions = [],
  toolCalls = [],
  plan = null,
  attachment,
  agentLabel = "Claude Agent",
  agentType,
  collaborationMode = "default",
  permissionMode,
  providerSnapshot,
  thinkingLevel,
  thinkingLevelOptions,
  activeBranch,
  workspaceName,
  workspaceRootPath,
  composerRef,
  sessionId,
  status,
  isRunning = false,
  canSendWhileRunning = false,
  supportsSteering = false,
  runtime,
  queuedInputs = [],
  onClearAttachment,
  onAnswerQuestion,
  onSelectCollaborationMode,
  onSelectPermissionMode,
  onSelectThinkingLevel,
  onSelectRuntimeConfig,
  onSelectRuntimeMode,
  onSelectAgent,
  onSend,
  onSubmitPreviousMessage,
  onCheckPreviousMessageCheckpoint,
  onStop,
  onDeleteQueuedInput,
  onSteerQueuedInput,
  onUpdateQueuedInput,
  onOpenToolLocation,
  onResolvePermission,
  onResolvePlanApproval,
  onDismissPlan,
  onTogglePlanCollapsed,
  planCollapsed,
  readOnly = false,
  parentSessionTitle = null,
  onOpenParentSession,
}: ChatViewProps) {
  const { t } = useTranslation("agent");
  const rememberPreviousMessageChoiceId = useId();
  const [rememberPreviousMessageChoice, setRememberPreviousMessageChoice] =
    useState(false);
  const [pendingPreviousMessageSubmit, setPendingPreviousMessageSubmit] =
    useState<PendingPreviousMessageSubmit | null>(null);
  const [isInitialBottomSettled, setIsInitialBottomSettled] = useState(false);
  const perfSessionId = sessionId ?? messages[0]?.sessionId ?? null;
  // Capture render-start only when perf observability is enabled. In
  // production this is a constant zero so React's effect dep diffing on this
  // value is stable across renders and the layout effects below early-bail.
  const renderStartedAt = isPerfEnabled() ? performance.now() : 0;
  const pendingPermissionRequest =
    [...permissionRequests]
      .reverse()
      .find((request) => request.status === "pending") ?? null;
  const pendingQuestion =
    [...questions]
      .reverse()
      .find((question) => question.status === "pending") ?? null;
  const { conversationGroups, timelineGroups } = useMemo(() => {
    const startLabel = "transcript-model-start";
    const endLabel = "transcript-model-end";

    if (perfSessionId) {
      markSessionSwitch(perfSessionId, startLabel, {
        messageCount: messages.length,
        questionCount: questions.length,
        toolCallCount: toolCalls.length,
      });
    }

    const model = getCachedTranscriptModel(
      perfSessionId,
      messages,
      toolCalls,
      questions,
    );

    if (perfSessionId) {
      markSessionSwitch(perfSessionId, endLabel, {
        conversationCount: model.conversationGroups.length,
        timelineGroupCount: model.timelineGroups.length,
      });
      measureSessionSwitch(
        perfSessionId,
        "transcript-model",
        startLabel,
        endLabel,
        {
          conversationCount: model.conversationGroups.length,
          messageCount: messages.length,
          timelineGroupCount: model.timelineGroups.length,
          toolCallCount: toolCalls.length,
        },
      );
    }

    return model;
  }, [messages, perfSessionId, questions, toolCalls]);
  const liveConversationGroup = isRunning
    ? (conversationGroups.at(-1) ?? null)
    : null;
  // Conversations rendered above the live (currently-running) conversation.
  // The live one is split out so its frequent prop updates don't churn the
  // memoized history list.
  const historicalConversationGroups = useMemo(
    () =>
      liveConversationGroup
        ? conversationGroups.slice(0, -1)
        : conversationGroups,
    [conversationGroups, liveConversationGroup],
  );
  const activity = useMemo(
    () =>
      getActivityState({
        isRunning,
        messages,
        status,
        toolCalls,
      }),
    [isRunning, messages, status, toolCalls],
  );
  // Stabilize parent-supplied event handlers via a ref. center-panel allocates
  // fresh inline arrows on every render (it re-renders on each Jotai update,
  // i.e. every streaming delta), which would otherwise propagate down through
  // ChatConversationItem and defeat React.memo on the history conversations.
  // The wrappers below have empty deps so their identity stays stable for the
  // full session; they read the latest callbacks through this ref.
  const callbacksRef = useRef({
    onAnswerQuestion,
    onResolvePermission,
    onOpenToolLocation,
    onCheckPreviousMessageCheckpoint,
    onSubmitPreviousMessage,
    onSend,
  });
  callbacksRef.current = {
    onAnswerQuestion,
    onResolvePermission,
    onOpenToolLocation,
    onCheckPreviousMessageCheckpoint,
    onSubmitPreviousMessage,
    onSend,
  };
  const stableOnAnswerQuestion = useCallback(
    (question: AgentQuestionRequestRecord, answer: string) =>
      callbacksRef.current.onAnswerQuestion?.(question, answer),
    [],
  );
  const stableOnResolvePermission = useCallback(
    (requestId: string, decision: AgentPermissionDecision) =>
      callbacksRef.current.onResolvePermission?.(requestId, decision),
    [],
  );
  const stableOnOpenToolLocation = useCallback(
    (location: ToolCallPreviewLocation) =>
      callbacksRef.current.onOpenToolLocation?.(location),
    [],
  );
  const chatContentRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const userMessageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const latestMessage = messages.at(-1);
  const stickyUserMessages = useMemo(
    () =>
      conversationGroups.flatMap((group) =>
        group.prompt
          ? [
              {
                attachments: group.prompt.attachments,
                content: group.prompt.content,
                id: group.prompt.id,
              } satisfies StickyUserMessage & UserMessageAnchor,
            ]
          : [],
      ),
    [conversationGroups],
  );
  const setUserMessageRef = useCallback(
    (messageId: string, element: HTMLDivElement | null) => {
      userMessageRefs.current[messageId] = element;
    },
    [],
  );
  const {
    activeUserMessageId,
    hasUserScrolled,
    isAutoScrolling,
    isNearBottom,
    isNearTop,
    scrollDirection,
    isStickyUserMessagePinned,
    markUserScrollIntent,
    markUserScrollStart,
    stickToBottomIfLocked,
    scrollToLatest,
    scrollToTop,
    scrollToUserMessage,
    syncScrollState,
  } = useChatScrollState({
    userMessageRefs,
    viewportRef,
  });
  // Sending a new prompt re-engages the bottom lock and jumps to the end —
  // the user is starting a new turn and expects to see the response, even
  // if they scrolled up to read history. We can't scroll synchronously here
  // because the new user message hasn't rendered yet (viewport.scrollHeight
  // is still the pre-send value). Instead we bump a counter; the layout
  // effect below runs after React commits the appended message and the
  // viewport now reflects the new height.
  const [scrollToBottomEpoch, setScrollToBottomEpoch] = useState(0);
  const stableOnSend = useCallback(
    (
      message: string,
      attachments: MessageAttachment[],
      useOppositeFollowUpBehavior?: boolean,
    ) => {
      callbacksRef.current.onSend(
        message,
        attachments,
        useOppositeFollowUpBehavior,
      );
      setScrollToBottomEpoch((value) => value + 1);
    },
    [],
  );
  useLayoutEffect(() => {
    if (scrollToBottomEpoch === 0) {
      return;
    }
    scrollToLatest("auto");
  }, [scrollToBottomEpoch, scrollToLatest]);
  const activeUserNavigationMessageId =
    activeUserMessageId ?? stickyUserMessages.at(-1)?.id ?? null;
  // The overlay bar shows the prompt the viewer is currently reading once its
  // real header has scrolled above the top. Hidden otherwise so it never
  // duplicates a visible header.
  const stickyBarMessage =
    isStickyUserMessagePinned && timelineGroups.length > 0
      ? (stickyUserMessages.find(
          (message) => message.id === activeUserNavigationMessageId,
        ) ?? null)
      : null;
  // Expose the floating overlay's height as `--md-anchor-offset` so markdown
  // heading anchors clear it when an in-document TOC link scrolls them up.
  const { offset: anchorScrollOffset, overlayRef } = useStickyOverlayOffset(
    stickyBarMessage !== null,
  );
  // One mutually-exclusive jump button. At the edges it points to the opposite
  // end; in the middle it mirrors the scroll direction.
  const jumpButton = resolveJumpButton({
    isReady:
      isInitialBottomSettled && !isAutoScrolling && timelineGroups.length > 0,
    hasUserScrolled,
    isNearTop,
    isNearBottom,
    scrollDirection,
  });
  const shouldShowJumpToLatest = jumpButton === "latest";
  const shouldShowJumpToTop = jumpButton === "top";
  // Latest values for diagnostics only — kept in a ref so the scroll handler
  // identity stays stable (otherwise ScrollArea would rebind every streaming
  // delta because conversationGroups.length changes).
  const perfScrollSnapshotRef = useRef({
    perfSessionId,
    conversationCount: conversationGroups.length,
  });
  perfScrollSnapshotRef.current = {
    perfSessionId,
    conversationCount: conversationGroups.length,
  };
  const handleUserScrollIntent = useCallback(() => {
    if (isPerfEnabled()) {
      const snapshot = perfScrollSnapshotRef.current;
      if (snapshot.perfSessionId) {
        const viewport = viewportRef.current;
        markSessionSwitch(snapshot.perfSessionId, "user-scroll-intent", {
          scrollHeight: viewport?.scrollHeight ?? null,
          scrollTop: viewport?.scrollTop ?? null,
          totalConversationCount: snapshot.conversationCount,
        });
      }
    }
    markUserScrollStart();
  }, [markUserScrollStart]);
  const submitPreviousMessage = useCallback(
    async (revertWorkspace: boolean) => {
      if (!pendingPreviousMessageSubmit || !onSubmitPreviousMessage) {
        return;
      }

      if (rememberPreviousMessageChoice) {
        localStorage.setItem(
          PREVIOUS_MESSAGE_REVERT_PREFERENCE_KEY,
          revertWorkspace ? "revert" : "dont-revert",
        );
      }

      const pending = pendingPreviousMessageSubmit;
      setPendingPreviousMessageSubmit(null);
      await onSubmitPreviousMessage(
        pending.message,
        pending.content,
        revertWorkspace,
      );
    },
    [
      onSubmitPreviousMessage,
      pendingPreviousMessageSubmit,
      rememberPreviousMessageChoice,
    ],
  );
  const handleSubmitPromptEdit = useCallback(
    async (message: MessageRecord, content: string) => {
      // Read latest parent callbacks via ref so this handler's identity
      // stays stable across re-renders — propagates through React.memo on
      // ChatConversationItem → UserPrompt without invalidating them.
      const submit = callbacksRef.current.onSubmitPreviousMessage;
      const checkCheckpoint =
        callbacksRef.current.onCheckPreviousMessageCheckpoint;
      if (!submit) {
        return;
      }

      const checkpointStatus = checkCheckpoint
        ? await checkCheckpoint(message)
        : { available: false };
      const storedPreference = localStorage.getItem(
        PREVIOUS_MESSAGE_REVERT_PREFERENCE_KEY,
      ) as PreviousMessageRevertPreference | null;

      if (storedPreference === "dont-revert") {
        await submit(message, content, false);
        return;
      }

      if (storedPreference === "revert" && checkpointStatus.available) {
        await submit(message, content, true);
        return;
      }

      setRememberPreviousMessageChoice(false);
      setPendingPreviousMessageSubmit({
        canRevert: checkpointStatus.available,
        content,
        message,
      });
    },
    [],
  );
  useLayoutEffect(() => {
    if (timelineGroups.length === 0) {
      setIsInitialBottomSettled(true);
      return;
    }

    stickToBottomIfLocked();
    const frameId = requestAnimationFrame(() => {
      stickToBottomIfLocked();
      setIsInitialBottomSettled(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, [stickToBottomIfLocked, timelineGroups.length]);

  // Content-size growth (streaming deltas, new messages, tool calls, plan
  // panel updates) is handled by the ResizeObserver attached to chatContent
  // below. We only re-stick on transitions that flip layout-relevant state
  // *without* a corresponding box-size change — namely `isRunning` going
  // false (activity line removal swaps inline indicators) and `status`
  // transitions. Keying on content length / updatedAt was the hot path
  // during streaming and is intentionally dropped.
  const stickStateTrigger = `${isRunning ? "run" : "idle"}:${status ?? ""}`;
  useLayoutEffect(() => {
    if (stickStateTrigger.length === 0 || timelineGroups.length === 0) {
      return;
    }
    stickToBottomIfLocked();
  }, [stickStateTrigger, stickToBottomIfLocked, timelineGroups.length]);

  useLayoutEffect(() => {
    syncScrollState(stickyUserMessages);
  }, [stickyUserMessages, syncScrollState]);

  useLayoutEffect(() => {
    const chatContent = chatContentRef.current;
    const viewport = viewportRef.current;
    if (!chatContent || !viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    // Scroll synchronously inside the observer callback. ResizeObserver
    // callbacks fire after layout but before paint, so adjusting scrollTop
    // here is invisible to the user. Deferring to RAF caused the browser to
    // paint one frame with stale scrollTop against new content height, which
    // showed up as a visible jump — most pronounced when the last message
    // contained a tall code block. viewport.scrollTo does not resize either
    // observed box, so this cannot loop.
    const observer = new ResizeObserver(() => {
      stickToBottomIfLocked();
    });

    // chatContent covers content growth (streaming deltas, new messages).
    // The viewport covers the opposite case: content stays put while the box
    // shrinks or grows around it — the composer dock changing height (task
    // panel appearing, collapsing, dismissed; permission cards; multi-line
    // input) or the window being resized.
    observer.observe(chatContent);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [stickToBottomIfLocked]);

  useChatViewPerfMarkers({
    perfSessionId,
    renderStartedAt,
    messageCount: messages.length,
    conversationCount: conversationGroups.length,
    toolCallCount: toolCalls.length,
    viewportRef,
    isNearBottom,
    navigationMessageCount: stickyUserMessages.length,
    isInitialBottomSettled,
    shouldShowJumpToLatest,
  });

  return (
    <section className="flex h-full flex-col bg-chat-canvas">
      <div
        className="relative flex-1 overflow-hidden"
        style={
          { "--md-anchor-offset": `${anchorScrollOffset}px` } as CSSProperties
        }
      >
        <UserMessageNavigation
          activeMessageId={activeUserNavigationMessageId}
          messages={stickyUserMessages}
          onSelect={scrollToUserMessage}
        />
        {stickyBarMessage ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-chat-canvas px-2 py-2 md:px-3 xl:px-6"
            ref={overlayRef}
          >
            <ChatContentColumn className="pointer-events-auto">
              <StickyUserMessageBar
                attachments={stickyBarMessage.attachments}
                content={stickyBarMessage.content}
                id={stickyBarMessage.id}
                onClick={() => scrollToUserMessage(stickyBarMessage.id)}
              />
            </ChatContentColumn>
          </div>
        ) : null}
        <ScrollArea
          className={cn(
            "h-full px-2 md:px-3 xl:px-6",
            !isInitialBottomSettled && "opacity-0",
          )}
          viewportProps={{
            onKeyDownCapture: handleUserScrollIntent,
            onPointerDown: markUserScrollIntent,
            onPointerDownCapture: markUserScrollIntent,
            onScroll: () => syncScrollState(stickyUserMessages),
            onTouchMoveCapture: handleUserScrollIntent,
            onWheelCapture: handleUserScrollIntent,
            tabIndex: 0,
          }}
          viewportRef={viewportRef}
        >
          <ChatContentColumn className="py-6" ref={chatContentRef}>
            {timelineGroups.length === 0 && !readOnly ? (
              <EmptyChatState
                activeBranch={activeBranch}
                workspaceName={workspaceName}
                agentLabel={agentLabel}
                agentType={agentType}
                attachment={attachment}
                draftKey={
                  sessionId ? sessionComposerDraftKey(sessionId) : undefined
                }
                collaborationMode={collaborationMode}
                composerRef={composerRef}
                permissionMode={permissionMode}
                providerSnapshot={providerSnapshot}
                thinkingLevel={thinkingLevel}
                thinkingLevelOptions={thinkingLevelOptions}
                isRunning={isRunning}
                canSendWhileRunning={canSendWhileRunning}
                runtimeCommands={runtime?.commands}
                runtimeConfigOptions={runtime?.configOptions}
                runtimeMode={runtime?.mode}
                onClearAttachment={onClearAttachment}
                onSelectCollaborationMode={onSelectCollaborationMode}
                onSelectPermissionMode={onSelectPermissionMode}
                onSelectThinkingLevel={onSelectThinkingLevel}
                onSelectRuntimeConfig={onSelectRuntimeConfig}
                onSelectRuntimeMode={onSelectRuntimeMode}
                onSelectAgent={onSelectAgent}
                onSend={stableOnSend}
                onStop={onStop}
                workspaceRootPath={workspaceRootPath}
              />
            ) : timelineGroups.length === 0 ? (
              <div className="text-chat-fg-muted text-meta">
                {t("toolCalls.subagentEmpty")}
              </div>
            ) : (
              <div data-testid="chat-timeline">
                {historicalConversationGroups.length > 0 ? (
                  <div className="flex flex-col">
                    {historicalConversationGroups.map(
                      (conversationGroup, index) => {
                        const isLatestHistoricalConversation =
                          !liveConversationGroup &&
                          index === historicalConversationGroups.length - 1;

                        return (
                          <div data-index={index} key={conversationGroup.id}>
                            <ChatConversationItem
                              // History items never render ActivityLine; omit
                              // the unstable activity object so React.memo
                              // sees stable props across streaming deltas.
                              activity={
                                isLatestHistoricalConversation
                                  ? activity
                                  : undefined
                              }
                              conversationGroup={conversationGroup}
                              isLatestConversation={
                                isLatestHistoricalConversation
                              }
                              isRunning={isRunning}
                              latestMessageId={latestMessage?.id ?? null}
                              onAnswerQuestion={stableOnAnswerQuestion}
                              onOpenToolLocation={stableOnOpenToolLocation}
                              onResolvePermission={stableOnResolvePermission}
                              onSubmitPromptEdit={
                                readOnly ? undefined : handleSubmitPromptEdit
                              }
                              setUserMessageRef={setUserMessageRef}
                              showMessageActions={!readOnly}
                            />
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : null}
                {liveConversationGroup ? (
                  <div className="relative">
                    <ChatConversationItem
                      activity={activity}
                      conversationGroup={liveConversationGroup}
                      isLatestConversation
                      isRunning={isRunning}
                      latestMessageId={latestMessage?.id ?? null}
                      onAnswerQuestion={stableOnAnswerQuestion}
                      onOpenToolLocation={stableOnOpenToolLocation}
                      onResolvePermission={stableOnResolvePermission}
                      onSubmitPromptEdit={
                        readOnly ? undefined : handleSubmitPromptEdit
                      }
                      setUserMessageRef={setUserMessageRef}
                      showMessageActions={!readOnly}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </ChatContentColumn>
        </ScrollArea>
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              setPendingPreviousMessageSubmit(null);
            }
          }}
          open={Boolean(pendingPreviousMessageSubmit)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("previousMessage.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("previousMessage.dialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <label
              className="flex items-center gap-2 text-sm text-chat-fg-secondary"
              htmlFor={rememberPreviousMessageChoiceId}
            >
              <Checkbox
                checked={rememberPreviousMessageChoice}
                id={rememberPreviousMessageChoiceId}
                onCheckedChange={(checked) =>
                  setRememberPreviousMessageChoice(checked === true)
                }
              />
              {t("previousMessage.dontAskAgain")}
            </label>
            {!pendingPreviousMessageSubmit?.canRevert ? (
              <p className="text-sm text-chat-fg-muted">
                {t("previousMessage.revertUnavailable")}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                onClick={() => setPendingPreviousMessageSubmit(null)}
                type="button"
                variant="ghost"
              >
                {t("previousMessage.cancel")}
              </Button>
              <Button
                onClick={() => void submitPreviousMessage(false)}
                type="button"
                variant="outline"
              >
                {t("previousMessage.dontRevert")}
              </Button>
              <Button
                disabled={!pendingPreviousMessageSubmit?.canRevert}
                onClick={() => void submitPreviousMessage(true)}
                type="button"
              >
                {t("previousMessage.revert")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <JumpControls
          onJumpToLatest={() => scrollToLatest("smooth")}
          onJumpToTop={() => scrollToTop("smooth")}
          showJumpToLatest={shouldShowJumpToLatest}
          showJumpToTop={shouldShowJumpToTop}
        />
      </div>
      {timelineGroups.length > 0 || readOnly ? (
        <ComposerDock
          activeBranch={activeBranch}
          workspaceName={workspaceName}
          agentLabel={agentLabel}
          agentType={agentType}
          attachment={attachment}
          draftKey={sessionId ? sessionComposerDraftKey(sessionId) : undefined}
          collaborationMode={collaborationMode}
          composerRef={composerRef}
          permissionMode={permissionMode}
          providerSnapshot={providerSnapshot}
          thinkingLevel={thinkingLevel}
          thinkingLevelOptions={thinkingLevelOptions}
          isRunning={isRunning}
          canSendWhileRunning={canSendWhileRunning}
          runtimeCommands={runtime?.commands}
          runtimeConfigOptions={runtime?.configOptions}
          runtimeMode={runtime?.mode}
          queuedInputs={queuedInputs}
          supportsSteering={supportsSteering}
          onClearAttachment={onClearAttachment}
          onSelectCollaborationMode={onSelectCollaborationMode}
          onSelectPermissionMode={onSelectPermissionMode}
          onSelectThinkingLevel={onSelectThinkingLevel}
          onSelectRuntimeConfig={onSelectRuntimeConfig}
          onSelectRuntimeMode={onSelectRuntimeMode}
          onSelectAgent={onSelectAgent}
          onSend={stableOnSend}
          onStop={onStop}
          onDeleteQueuedInput={onDeleteQueuedInput}
          onSteerQueuedInput={onSteerQueuedInput}
          onUpdateQueuedInput={onUpdateQueuedInput}
          onResolvePermission={onResolvePermission}
          onResolvePlanApproval={onResolvePlanApproval}
          onDismissPlan={onDismissPlan}
          onTogglePlanCollapsed={onTogglePlanCollapsed}
          pendingPermissionRequest={pendingPermissionRequest}
          pendingPlanApproval={pendingPlanApproval}
          pendingQuestion={pendingQuestion}
          onAnswerQuestion={stableOnAnswerQuestion}
          plan={plan}
          planCollapsed={planCollapsed}
          workspaceRootPath={workspaceRootPath}
          hideComposer={readOnly}
          parentSessionTitle={parentSessionTitle}
          onOpenParentSession={onOpenParentSession}
        />
      ) : null}
    </section>
  );
}
