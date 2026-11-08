import {
  generateLocalSessionTitle,
  type SessionRecord,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import {
  applyRefinedSessionTitleAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import { desktopApi, logRendererDiagnostic } from "@/lib";

export function useSessionSendTitle() {
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const applyRefinedSessionTitle = useSetAtom(applyRefinedSessionTitleAtom);

  const prepareAutoSessionTitle = (
    session: SessionRecord,
    message: string,
    enabled: boolean,
  ) => {
    if (!enabled) {
      logRendererDiagnostic(
        "debug",
        "[SessionTitle] local generation disabled",
        {
          sessionId: session.id,
        },
      );
      return session;
    }

    const fallbackTitle = session.title;
    const title = generateLocalSessionTitle(message, fallbackTitle);
    logRendererDiagnostic(
      "debug",
      "[SessionTitle] local generation evaluated",
      {
        changed: title !== fallbackTitle,
        messageLength: message.length,
        sessionId: session.id,
      },
    );

    if (title === fallbackTitle) {
      return session;
    }

    const updatedAt = new Date().toISOString();
    const updatedSession = updateSessionTitle({
      sessionId: session.id,
      title,
      expectedTitle: fallbackTitle,
      updatedAt,
    });

    logRendererDiagnostic(
      "debug",
      "[SessionTitle] local title update applied",
      {
        sessionId: session.id,
        updated: Boolean(updatedSession),
      },
    );

    return updatedSession ?? session;
  };

  const refineAutoSessionTitle = (
    session: SessionRecord,
    message: string,
    expectedTitle: string,
  ) => {
    logRendererDiagnostic(
      "debug",
      "[SessionTitle] provider refinement requested",
      {
        messageLength: message.length,
        sessionId: session.id,
      },
    );

    void desktopApi
      .refineSessionTitle({
        sessionId: session.id,
        message,
        fallbackTitle: session.title,
        expectedTitle,
      })
      .then((updatedSession) => {
        logRendererDiagnostic(
          "debug",
          "[SessionTitle] provider refinement completed",
          {
            sessionId: session.id,
            updated: Boolean(
              updatedSession && updatedSession.title !== expectedTitle,
            ),
          },
        );

        if (updatedSession && updatedSession.title !== expectedTitle) {
          applyRefinedSessionTitle({
            expectedTitle,
            refinedSession: updatedSession,
          });
        }
      })
      .catch((error) => {
        logRendererDiagnostic(
          "debug",
          "[SessionTitle] provider refinement failed",
          {
            error: error instanceof Error ? error.message : "Unknown error",
            sessionId: session.id,
          },
        );
      });
  };

  return { prepareAutoSessionTitle, refineAutoSessionTitle };
}
