import type { BrowserAnnotation } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useEffect, useEffectEvent } from "react";
import {
  applyAgentEventAtom,
  applyAgentRuntimeEventAtom,
  applyPermissionEventAtom,
  applyPlanApprovalEventAtom,
  applyPlanEventAtom,
  applyQuestionEventAtom,
  applyQueuedInputEventAtom,
  applyToolEventAtom,
} from "@/features/agent";
import {
  addAnnotationAtom,
  browserErrorAtom,
  browserTitleAtom,
  browserUrlAtom,
  browserUrlInputAtom,
  isBrowserLoadingAtom,
} from "@/features/browser";
import {
  applyContextBreakdownEventAtom,
  applyRateLimitsEventAtom,
  applyUsageEventAtom,
} from "@/features/composer";
import {
  markSessionMessageAtom,
  updateSessionStatusAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import { applyTurnChangesEventAtom } from "@/features/turn-workspace-changes";
import { desktopApi } from "@/lib";

export function useAgentEventBridge() {
  const applyAgentEvent = useSetAtom(applyAgentEventAtom);
  const applyQueuedInputEvent = useSetAtom(applyQueuedInputEventAtom);
  const applyAgentRuntimeEvent = useSetAtom(applyAgentRuntimeEventAtom);
  const applyPermissionEvent = useSetAtom(applyPermissionEventAtom);
  const applyPlanApprovalEvent = useSetAtom(applyPlanApprovalEventAtom);
  const applyPlanEvent = useSetAtom(applyPlanEventAtom);
  const applyQuestionEvent = useSetAtom(applyQuestionEventAtom);
  const applyToolEvent = useSetAtom(applyToolEventAtom);
  const applyTurnChangesEvent = useSetAtom(applyTurnChangesEventAtom);
  const applyUsageEvent = useSetAtom(applyUsageEventAtom);
  const applyRateLimitsEvent = useSetAtom(applyRateLimitsEventAtom);
  const applyContextBreakdownEvent = useSetAtom(applyContextBreakdownEventAtom);
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const markSessionMessage = useSetAtom(markSessionMessageAtom);

  const handleAgentEvent = useEffectEvent(
    (
      event: Parameters<typeof desktopApi.onAgentEvent>[0] extends (
        payload: infer T,
      ) => void
        ? T
        : never,
    ) => {
      applyAgentEvent(event);
      applyQueuedInputEvent(event);
      applyAgentRuntimeEvent(event);
      applyPermissionEvent(event);
      applyPlanApprovalEvent(event);
      applyPlanEvent(event);
      applyQuestionEvent(event);
      applyToolEvent(event);
      applyTurnChangesEvent(event);
      applyUsageEvent(event);
      applyRateLimitsEvent(event);
      applyContextBreakdownEvent(event);

      if (event.type === "session.title.updated") {
        updateSessionTitle({
          sessionId: event.sessionId,
          title: event.title,
          expectedTitle: event.expectedTitle,
          updatedAt: event.updatedAt,
        });
        return;
      }

      if (event.type === "state.changed") {
        updateSessionStatus({
          sessionId: event.sessionId,
          status: event.status,
        });
        return;
      }

      if (event.type === "message.completed") {
        markSessionMessage({
          sessionId: event.sessionId,
          createdAt: event.message.createdAt,
        });
        return;
      }

      if (event.type === "tool.started") {
        return;
      }

      if (event.type === "tool.finished") {
        return;
      }

      if (event.type === "error") {
        console.error("[AgentEvent] error", {
          error: event.message,
          sessionId: event.sessionId,
        });
        updateSessionStatus({
          sessionId: event.sessionId,
          status: "error",
        });
        markSessionMessage({
          sessionId: event.sessionId,
          createdAt: new Date().toISOString(),
        });
      }
    },
  );

  useEffect(() => desktopApi.onAgentEvent(handleAgentEvent), []);
}

export function useBrowserEventBridge() {
  const addAnnotation = useSetAtom(addAnnotationAtom);
  const setBrowserError = useSetAtom(browserErrorAtom);
  const setBrowserTitle = useSetAtom(browserTitleAtom);
  const setBrowserUrl = useSetAtom(browserUrlAtom);
  const setBrowserUrlInput = useSetAtom(browserUrlInputAtom);
  const setIsBrowserLoading = useSetAtom(isBrowserLoadingAtom);

  useEffect(() => {
    const unsubAnnotation = desktopApi.onBrowserAnnotation(
      (annotation: BrowserAnnotation) => {
        addAnnotation(annotation);
      },
    );

    const unsubLoading = desktopApi.onBrowserLoading((loading: boolean) => {
      setIsBrowserLoading(loading);
    });

    const unsubTitle = desktopApi.onBrowserTitle((title: string) => {
      setBrowserTitle(title);
    });

    // Keep the URL bar in sync with in-page link clicks and redirects; a
    // successful navigation also recovers from a previous load error.
    const unsubNavigated = desktopApi.onBrowserNavigated((url: string) => {
      setBrowserUrl(url);
      setBrowserUrlInput(url);
      setBrowserError(null);
    });

    const unsubError = desktopApi.onBrowserError(
      (error: { url: string; message: string }) => {
        setBrowserError(error.message);
      },
    );

    return () => {
      unsubAnnotation();
      unsubLoading();
      unsubTitle();
      unsubNavigated();
      unsubError();
    };
  }, [
    addAnnotation,
    setIsBrowserLoading,
    setBrowserTitle,
    setBrowserUrl,
    setBrowserUrlInput,
    setBrowserError,
  ]);
}
