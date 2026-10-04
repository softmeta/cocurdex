import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@/components/ui";
import { i18n } from "@/i18n";
import { applyPlatformAttribute, desktopApi } from "@/lib";

import "./styles/globals.css";

// Tag the platform before first paint so platform-conditional styling (e.g.
// native scrollbar treatment in base.css) applies without a flash.
applyPlatformAttribute();

async function loadApp(): Promise<ComponentType> {
  const { syncInitialPreferences } = await import(
    "./app/layout/app-shell/app-shell-preferences"
  );
  syncInitialPreferences();
  const { startAgentEventBridge } = await import(
    "./app/layout/app-shell/agent-event-bridge"
  );
  startAgentEventBridge();
  if (new URLSearchParams(window.location.search).get("window") === "chat") {
    const { DetachedChatApp } = await import(
      "./app/layout/chat-window/detached-chat-app"
    );
    return DetachedChatApp;
  }
  const [{ App }, { preloadScreensWhenIdle }] = await Promise.all([
    import("./app/App"),
    import("./app/layout/app-shell/idle-preload"),
  ]);
  preloadScreensWhenIdle();
  return App;
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

window.addEventListener("error", (event) => {
  void desktopApi.logRendererError({
    details: {
      colno: event.colno,
      error: event.error,
      lineno: event.lineno,
      message: event.message,
      script: event.filename,
    },
    event: "renderer.windowError",
    level: "error",
    scope: "renderer",
  });
});

window.addEventListener("unhandledrejection", (event) => {
  void desktopApi.logRendererError({
    details: {
      reason: event.reason,
    },
    event: "renderer.unhandledRejection",
    level: "error",
    scope: "renderer",
  });
});

void loadApp().then((App) => {
  createRoot(rootElement).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </I18nextProvider>
    </StrictMode>,
  );
});
