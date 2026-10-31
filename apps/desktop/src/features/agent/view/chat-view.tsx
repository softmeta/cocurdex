import {
  type AgentQuestionRequestRecord,
  type MessageAttachment,
  resolveJumpButton,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createRenderReadiness,
  RenderReadinessContext,
  useRenderReadiness,
} from "@/components";
import { ScrollArea } from "@/components/ui";
import {
  ChatContentColumn,
  type ComposerSendOutcome,
  sessionComposerDraftKey,
} from "@/features/composer";
import {
  ScriptRunProposals,
  sessionRunStartedAtAtom,
} from "@/features/sessions";
import {
  cn,
  isPerfEnabled,
  markSessionSwitch,
  measureSessionSwitch,
} from "@/lib";
import { useChatReadingPosition } from "@/lib/use-chat-reading-position";
import type { ToolCallPreviewLocation } from "../tool-call";
import { getActivityState } from "./chat-activity-state";
import { isDisclosureToggle } from "./chat-scroll";
import { getCachedTranscriptModel } from "./chat-transcript-model";
import {
  type UserMessageAnchor,
  UserMessageNavigation,
} from "./chat-user-navigation";
import { ComposerDock, EmptyChatState, JumpControls } from "./chat-view-panels";
import type { ChatViewProps } from "./chat-view-types";
import { useChatBottomStick } from "./use-chat-bottom-stick";
import { useChatScrollState } from "./use-chat-scroll-state";
import { useChatViewPerfMarkers } from "./use-chat-view-perf-markers";
import { useSentPromptAnchor } from "./use-sent-prompt-anchor";
import {
  type ChatTimelineScrollHandle,
  ChatVirtualTimeline,
} from "./virtual-timeline";

const CONTENT_READY_DEADLINE_MS = 1_000;

export function ChatView({
  chatComposer,
  messages,
  permissionRequests = [],
  pendingPlanApproval = null,
  questions = [],
  toolCalls = [],
  plan = null,
  attachment,
  composerContextChips,
  agentLabel = "Claude Agent",
  agentType,
  sessionModeId = null,
  permissionMode,
  providerSnapshot,
  thinkingLevel,
  thinkingLevelOptions,
  activeBranch,
  workspace,
  workspaceRootPath,
  workspaceRootPaths,
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
  onSelectSessionMode,
  onSelectPermissionMode,
  onSelectThinkingLevel,
  onSelectRuntimeMode,
  onSelectAgent,
  onSend,
  onStop,
  onDeleteQueuedInput,
  onSendNowQueuedInput,
  onResumeQueuedInputs,
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
  const [isInitialBottomSettled, setIsInitialBottomSettled] = useState(false);
  const [renderReadiness] = useState(createRenderReadiness);
  const isContentReady = useRenderReadiness(
    renderReadiness,
    CONTENT_READY_DEADLINE_MS,
  );
  const perfSessionId = sessionId ?? messages[0]?.sessionId ?? null;
  const runStartedAtBySession = useAtomValue(sessionRunStartedAtAtom);
  const runStartedAt = perfSessionId
    ? runStartedAtBySession[perfSessionId]
    : undefined;
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
    onSend,
  });
  callbacksRef.current = {
    onAnswerQuestion,
    onResolvePermission,
    onOpenToolLocation,
    onSend,
  };
  const stableOnAnswerQuestion = useCallback(
    (question: AgentQuestionRequestRecord, answer: string) =>
      callbacksRef.current.onAnswerQuestion?.(question, answer),
    [],
  );
  const stableOnResolvePermission = useCallback(
    (requestId: string, optionId: string) =>
      callbacksRef.current.onResolvePermission?.(requestId, optionId),
    [],
  );
  const stableOnOpenToolLocation = useCallback(
    (location: ToolCallPreviewLocation) =>
      callbacksRef.current.onOpenToolLocation?.(location),
    [],
  );
  const chatContentRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(
    null,
  );
  const attachViewport = useCallback((element: HTMLDivElement | null) => {
    viewportRef.current = element;
    setViewportElement(element);
  }, []);
  const timelineScrollRef = useRef<ChatTimelineScrollHandle | null>(null);
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
              } satisfies UserMessageAnchor,
            ]
          : [],
      ),
    [conversationGroups],
  );
  const setUserMessageRef = useCallback(
    (messageId: string, element: HTMLDivElement | null) => {
      if (element) userMessageRefs.current[messageId] = element;
      else delete userMessageRefs.current[messageId];
    },
    [],
  );
  const {
    activeUserMessageId,
    finishInitialPositioning,
    isNearBottom,
    isNearTop,
    scrollDirection,
    markUserScrollIntent,
    markUserScrollStart,
    holdForDisclosure,
    syncViewportLayout,
    scrollToLatest,
    scrollToTop,
    scrollToUserMessage,
    syncScrollState,
  } = useChatScrollState({
    timelineScrollRef,
    userMessageRefs,
    viewportRef,
  });
  useChatReadingPosition(
    `session:${sessionId ?? ""}`,
    () => timelineScrollRef.current?.readPosition() ?? null,
    (position) => {
      if (!timelineScrollRef.current || !isInitialBottomSettled) return false;
      markUserScrollStart(-1);
      return timelineScrollRef.current.restorePosition(position);
    },
  );
  // Sending a new prompt pins it to the top of the viewport once it renders;
  // the response then grows in place below it instead of being followed.
  const { anchoredPromptId, anchorNextPrompt } = useSentPromptAnchor({
    awaitingReplyOnMount: isRunning && latestMessage?.role === "user",
    latestPromptId: stickyUserMessages.at(-1)?.id ?? null,
    scrollToUserMessage,
  });
  const stableOnSend = useCallback(
    (
      message: string,
      attachments: MessageAttachment[],
      useOppositeFollowUpBehavior?: boolean,
    ): ComposerSendOutcome => {
      callbacksRef.current.onSend(
        message,
        attachments,
        useOppositeFollowUpBehavior,
      );
      scrollToLatest();
      anchorNextPrompt();
      return "sent";
    },
    [anchorNextPrompt, scrollToLatest],
  );
  const activeUserNavigationMessageId =
    activeUserMessageId ?? stickyUserMessages.at(-1)?.id ?? null;
  const jumpButton = resolveJumpButton({
    streaming: isRunning,
    isReady: isInitialBottomSettled && timelineGroups.length > 0,
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
  const handleUserScrollIntent = useCallback(
    (deltaY?: number) => {
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
      markUserScrollStart(deltaY);
    },
    [markUserScrollStart],
  );
  if (timelineGroups.length === 0 && !isInitialBottomSettled) {
    setIsInitialBottomSettled(true);
  }
  useChatBottomStick({
    chatContentRef,
    isContentReady,
    isContentReadyNow: renderReadiness.isReady,
    isRunning,
    finishInitialPositioning,
    setInitialBottomSettled: setIsInitialBottomSettled,
    status,
    syncViewportLayout,
    stickyUserMessages,
    syncScrollState,
    timelineGroupCount: timelineGroups.length,
    timelineScrollRef,
    viewportRef,
  });

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
    <section className="@container/chat flex h-full flex-col bg-chat-canvas">
      <div className="relative flex-1 overflow-hidden">
        <UserMessageNavigation
          activeMessageId={activeUserNavigationMessageId}
          messages={stickyUserMessages}
          onSelect={scrollToUserMessage}
        />
        <RenderReadinessContext value={renderReadiness}>
          <ScrollArea
            className={cn(
              "h-full px-2 @lg/chat:px-3 @3xl/chat:px-6",
              !isInitialBottomSettled && "opacity-0",
            )}
            scrollbarProps={{
              onPointerDownCapture: markUserScrollIntent,
            }}
            viewportProps={{
              className: "[overflow-anchor:none]",
              onClickCapture: (event) => {
                if (isDisclosureToggle(event.target)) {
                  holdForDisclosure();
                }
              },
              onKeyDownCapture: () => handleUserScrollIntent(),
              onPointerDown: markUserScrollIntent,
              onPointerDownCapture: markUserScrollIntent,
              onScroll: () => syncScrollState(stickyUserMessages),
              onTouchMoveCapture: () => handleUserScrollIntent(),
              onWheelCapture: (event) => handleUserScrollIntent(event.deltaY),
              tabIndex: 0,
            }}
            viewportRef={attachViewport}
          >
            <ChatContentColumn
              className={cn("pt-6", timelineGroups.length === 0 && "pb-6")}
              ref={chatContentRef}
            >
              {timelineGroups.length === 0 && !readOnly ? (
                <EmptyChatState
                  activeBranch={activeBranch}
                  workspace={workspace}
                  sessionId={sessionId}
                  agentLabel={agentLabel}
                  agentType={agentType}
                  attachment={attachment}
                  composerContextChips={composerContextChips}
                  draftKey={
                    sessionId ? sessionComposerDraftKey(sessionId) : undefined
                  }
                  sessionModeId={sessionModeId}
                  composerRef={composerRef}
                  permissionMode={permissionMode}
                  providerSnapshot={providerSnapshot}
                  thinkingLevel={thinkingLevel}
                  thinkingLevelOptions={thinkingLevelOptions}
                  isRunning={isRunning}
                  canSendWhileRunning={canSendWhileRunning}
                  runtimeCommands={runtime?.commands}
                  runtimeMode={runtime?.mode}
                  onClearAttachment={onClearAttachment}
                  onSelectSessionMode={onSelectSessionMode}
                  onSelectPermissionMode={onSelectPermissionMode}
                  onSelectThinkingLevel={onSelectThinkingLevel}
                  onSelectRuntimeMode={onSelectRuntimeMode}
                  onSelectAgent={onSelectAgent}
                  onSend={stableOnSend}
                  onStop={onStop}
                  workspaceRootPath={workspaceRootPath}
                  workspaceRootPaths={workspaceRootPaths}
                />
              ) : timelineGroups.length === 0 ? (
                <div className="text-chat-fg-muted text-meta">
                  {t("toolCalls.subagentEmpty")}
                </div>
              ) : (
                <>
                  <ChatVirtualTimeline
                    activity={activity}
                    anchoredPromptId={anchoredPromptId}
                    groups={conversationGroups}
                    isRunning={isRunning}
                    latestMessageId={latestMessage?.id ?? null}
                    onAnswerQuestion={stableOnAnswerQuestion}
                    onOpenToolLocation={stableOnOpenToolLocation}
                    onResolvePermission={stableOnResolvePermission}
                    runStartedAt={runStartedAt}
                    scrollRef={timelineScrollRef}
                    setUserMessageRef={setUserMessageRef}
                    showMessageActions={!readOnly}
                    userMessageRefs={userMessageRefs}
                    viewportElement={viewportElement}
                  />
                  {sessionId && !readOnly ? (
                    <ScriptRunProposals key={sessionId} sessionId={sessionId} />
                  ) : null}
                </>
              )}
            </ChatContentColumn>
          </ScrollArea>
        </RenderReadinessContext>
        <JumpControls
          streaming={isRunning && shouldShowJumpToLatest}
          onJumpToLatest={() => scrollToLatest(true)}
          onJumpToTop={scrollToTop}
          showJumpToLatest={shouldShowJumpToLatest}
          showJumpToTop={shouldShowJumpToTop}
        />
      </div>
      {timelineGroups.length > 0 || readOnly ? (
        <ComposerDock
          chatComposer={chatComposer}
          activeBranch={activeBranch}
          workspace={workspace}
          sessionId={sessionId}
          agentLabel={agentLabel}
          agentType={agentType}
          attachment={attachment}
          composerContextChips={composerContextChips}
          draftKey={sessionId ? sessionComposerDraftKey(sessionId) : undefined}
          sessionModeId={sessionModeId}
          composerRef={composerRef}
          permissionMode={permissionMode}
          providerSnapshot={providerSnapshot}
          thinkingLevel={thinkingLevel}
          thinkingLevelOptions={thinkingLevelOptions}
          isRunning={isRunning}
          canSendWhileRunning={canSendWhileRunning}
          runtimeCommands={runtime?.commands}
          runtimeMode={runtime?.mode}
          queuedInputs={queuedInputs}
          supportsSteering={supportsSteering}
          onClearAttachment={onClearAttachment}
          onSelectSessionMode={onSelectSessionMode}
          onSelectPermissionMode={onSelectPermissionMode}
          onSelectThinkingLevel={onSelectThinkingLevel}
          onSelectRuntimeMode={onSelectRuntimeMode}
          onSelectAgent={onSelectAgent}
          onSend={stableOnSend}
          onStop={onStop}
          onDeleteQueuedInput={onDeleteQueuedInput}
          onSendNowQueuedInput={onSendNowQueuedInput}
          onResumeQueuedInputs={onResumeQueuedInputs}
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
          workspaceRootPaths={workspaceRootPaths}
          hideComposer={readOnly}
          parentSessionTitle={parentSessionTitle}
          onOpenParentSession={onOpenParentSession}
        />
      ) : null}
    </section>
  );
}
