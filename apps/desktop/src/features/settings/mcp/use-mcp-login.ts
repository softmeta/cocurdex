import { useRef, useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

export type McpLoginState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "waiting"; loginId: string; authUrl: string }
  | { phase: "failed"; error: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useMcpLogin({
  name,
  workspaceId,
  onSignedIn,
}: {
  name: string;
  workspaceId?: string;
  onSignedIn(): void;
}) {
  const [state, setState] = useState<McpLoginState>({ phase: "idle" });
  const activeLoginRef = useRef<string | null>(null);
  const attemptRef = useRef(0);

  function abandonLogin() {
    attemptRef.current += 1;
    const loginId = activeLoginRef.current;
    activeLoginRef.current = null;
    if (loginId) void desktopApi.cancelMcpLogin(loginId).catch(() => {});
  }

  useMountEffect(() => abandonLogin);

  async function start() {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    setState({ phase: "starting" });
    try {
      const started = await desktopApi.startMcpLogin(name, workspaceId);
      if (attemptRef.current !== attempt) {
        if (started.loginId) {
          void desktopApi.cancelMcpLogin(started.loginId).catch(() => {});
        }
        return;
      }
      if (!started.loginId || !started.authUrl) {
        setState({ phase: "idle" });
        onSignedIn();
        return;
      }
      const loginId = started.loginId;
      activeLoginRef.current = loginId;
      setState({ phase: "waiting", loginId, authUrl: started.authUrl });
      void desktopApi.openExternal(started.authUrl);
      const outcome = await desktopApi.waitMcpLogin(loginId);
      if (activeLoginRef.current !== loginId) return;
      activeLoginRef.current = null;
      if (outcome.success) {
        setState({ phase: "idle" });
        onSignedIn();
        return;
      }
      setState({ phase: "failed", error: outcome.error ?? "" });
    } catch (error) {
      if (attemptRef.current !== attempt) return;
      activeLoginRef.current = null;
      setState({ phase: "failed", error: errorMessage(error) });
    }
  }

  function cancel() {
    abandonLogin();
    setState({ phase: "idle" });
  }

  async function signOut() {
    try {
      await desktopApi.logoutMcpServer(name, workspaceId);
      setState({ phase: "idle" });
      onSignedIn();
    } catch (error) {
      setState({ phase: "failed", error: errorMessage(error) });
    }
  }

  return { state, start, cancel, signOut };
}
