import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@/components/ui";
import { i18n } from "@/i18n";
import { applyPlatformAttribute, desktopApi } from "@/lib";
import { App } from "./app/App";
import "./styles/globals.css";

// Tag the platform before first paint so platform-conditional styling (e.g.
// native scrollbar treatment in base.css) applies without a flash.
applyPlatformAttribute();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

window.addEventListener("error", (event) => {
  void desktopApi.logRendererError({
    details: {
      colno: event.colno,
      error: event.error,
      filename: event.filename,
      lineno: event.lineno,
      message: event.message,
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

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </I18nextProvider>
  </StrictMode>,
);
